const request = require('request');
const amqp = require('amqplib');
require('dotenv').config();

// Returns promise that resolves JWT Token for WordPress authentication
function tokenFunc() {
	let data = {username : process.env.WORDPRESS_USER, password : process.env.WORDPRESS_PASS};
	return new Promise(function(resolve, reject)  {
		request({
			url: process.env.WORDPRESS_ROOT_PATH + "/wp-json/jwt-auth/v1/token",
			ContentType : 'application/x-www-form-urlencoded',
			method: "POST",
			form: data
		}, function(error, response, body) {
			if(error) {
				reject(error)
			} else {
				let info = body.substring(body.indexOf("{"));
				info = JSON.parse(body);
				info = info.token;
				resolve(info);
			}
		});
	});
}

// Returns promise the resolves the body text of a certain post
function postResponse(JWTtoken, postID) {
	let bodyStr;
	return new Promise(function(resolve, promise) {
		request({
			url: process.env.WORDPRESS_ROOT_PATH + "/wp-json/wp/v2/posts/" + postID,
			method: "GET",
			headers: {},
			auth: {'bearer' : JWTtoken}
		}, function(error,response,body) {
			// Cleaning up response and parsing to JSON object
			bodyStr = body.substring(body.indexOf('{"id"}'));
			bodyStr = JSON.parse(bodyStr).content.rendered;
			resolve(bodyStr);
		});
	});
}

// Returns promise that resolves with Watson's responses from the post's body text (two arrays)
function watsonResponse(bodyStr) {
	let watOrgArray = [];
	let watPersonArray = [];
	return new Promise(function(resolve,reject) {
		request({
			url: "https://gateway.watsonplatform.net/natural-language-understanding/api/v1/analyze?version=2018-11-16",
			method: "POST",
			headers: {'Content-type' : 'application/json'},
			auth: {
				'user' : 'apikey',
				'pass' : process.env.WATSON_ACCESS_KEY,
				'sendImmediately' : true
			},
			body: {
				"language" : "en",
				"html" : bodyStr,
				"features" : {
					"entities" : {
						"emotion" : false,
						"sentiment" : false,
						"limit" : 50
					}
				}
			},
			json : true
			
		}, function(error, response, body) {
			// Parsing response for 'Company' and 'Person' entities
			body.entities.forEach(function(entity) {
				if(entity.type == "Company") {
					watOrgArray.push(entity.text)
				} else if(entity.type == "Person") {
					watPersonArray.push(entity.text)
				}
			});
			console.log("Organization terms found: " + watOrgArray);
			console.log("Person terms found: " + watPersonArray);
			resolve([watPersonArray,watOrgArray]);
		});
	});

}
 
// Confirming RabbitMQ channel and queue connection
const open = amqp.connect("amqp://localhost");
return open
    .then(conn => {
		return conn.createChannel();
    })
	.then(channel => {
		// Setting up consumer for "sampleQueue" to read in messages sent by server.js
		// This block of code is written utilizing the new ECS8 Async and Await functionality
		return channel.consume("sampleQueue", async function(msgOrFalse) {
			let result = "No messages in queue";
			if (msgOrFalse !== false) {
				result = msgOrFalse.content.toString() + " : Message recieved at " + new Date();
				let postID = msgOrFalse.content.toString();
				let token = await tokenFunc();
				let bodyStr = await postResponse(token, postID);
				let terms = await watsonResponse(bodyStr);
				request({
					url: process.env.WORDPRESS_ROOT_PATH + "/wp-json/wp/v2/posts/" + postID,
					headers: {
						'Content-Type' : 'application/json',
					},
					auth: {'bearer' : token},
					method: "POST",
					json: true,
					body: {
						"terms" : {
							"people" : terms[0],
							"organization" : terms[1]
						}
					}
				}, function (error, response, body) {
					if(error) {
						console.log(error);
					}
				});
			}
			// Acknowledge message was processed and are ready for the next message in queue
			channel.ack(msgOrFalse);
			console.log(" [-] %s", result);
			console.log("-------------------------------------------------------------------------------------------------------|");
		});

	});
