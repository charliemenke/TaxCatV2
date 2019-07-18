const request = require('request');
const amqp = require('amqplib');
require('dotenv').config();

function tokenFunc() {
	let data = {username : 'Planet Analog', password : '&oaooEW@G16yJLf7Wm'};
	return new Promise(function(resolve, reject)  {
		request({
			url: "http://localhost/wordpress/wp-json/jwt-auth/v1/token",
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

function postResponse(JWTtoken, postID) {

	let bodyStr;
	return new Promise(function(resolve, promise) {
		request({
			url: "http://localhost/wordpress/wp-json/wp/v2/posts/" + postID,
			method: "POST",
			headers: {},
			auth: {'bearer' : JWTtoken}
		}, function(error,response,body) {
			bodyStr = body.substring(body.indexOf('{"id"'));
			bodyStr = JSON.parse(bodyStr).content.rendered;
			resolve(bodyStr);
		});
	});
}

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
				'pass' : 'StmXoAj_nUan6OmxPieWzCg4fHcjzt-ZLPGjdqmBnsNB',
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
 

const open = amqp.connect("amqp://localhost");
return open
    .then(conn => {
		return conn.createChannel();
    })
	.then(channel => {
		return channel.consume("sampleQueue", async function(msgOrFalse) {
			let result = "No messages in queue";
			if (msgOrFalse !== false) {
				result = msgOrFalse.content.toString() + " : Message recieved at " + new Date();
				let postID = msgOrFalse.content.toString();
				console.log("PostID: " + postID);
				let token = await tokenFunc();
				let bodyStr = await postResponse(token, postID);
				let terms = await watsonResponse(bodyStr);
				request({
					url: "http://localhost/wordpress/wp-json/wp/v2/posts/" + postID,
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
					
				});
			}
			channel.ack(msgOrFalse);
			console.log(" [-] %s", result);
		});

	});
