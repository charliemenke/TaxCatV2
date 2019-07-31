const request = require('request');
const amqp = require('amqplib');
const aws = require('aws-sdk');
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
				info = JSON.parse(info);
				info = info.token;
				resolve(info);
				/*
				request({
					url: process.env.WORDPRESS_ROOT_PATH + '/wp-json/jwt-auth/v1/token/validate',
					ContentType: 'application/json',
					method: 'POST',
					auth: {'bearer' : info},
					json: true
				}, function(error, response, body) {
					if(error) {
						reject(error);
					}
					if(body == undefined) {
						reject("Not a real postID");
					}
					body = body.substring(body.indexOf("{"));
					body = JSON.parse(body);
					console.log(body);
					if(body.code == "jwt_auth_valid_token") {
						resolve(info);
					}
				});
				*/
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
			if(error) {
				reject(error);
			}
			// Cleaning up response and parsing to JSON object
			bodyStr = body.substring(body.indexOf('{"id"'));
			bodyStr = bodyStr.substr(0,bodyStr.lastIndexOf("}") + 1);
			bodyStr = JSON.parse(bodyStr).content.rendered;
			console.log(bodyStr);
			resolve(bodyStr);
		});
	});
}

// Returns promise that resolves with Watson's responses from the post's body text (two arrays)
function watsonResponse(bodyStr) {
	let watOrgArray = [];
	let watPersonArray = [];
	let watConceptsArray = [];
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
					},
					"concepts" : {
						"limit" : 3
					}
				}
			},
			json : true
			
		}, function(error, response, body) {
			if(error) {
				reject(error);
			}
			// Parsing response for 'Company' and 'Person' entities
			body.entities.forEach(function(entity) {
				if(entity.type == "Company") {
					watOrgArray.push(entity.text)
				} else if(entity.type == "Person") {
					watPersonArray.push(entity.text)
				}
			});
			body.concepts.forEach(function(concept) {
				watConceptsArray.push(concept.text);
			});
			console.log("Organization terms found: " + watOrgArray);
			console.log("Person terms found: " + watPersonArray);
			console.log("Concepts found: " + watConceptsArray);
			resolve([watPersonArray, watOrgArray, watConceptsArray]);
		});
	});
}

function azureResponse(bodyStr) {
	let azureOrgArray = [];
	let azurePersonArray = [];
	let jsonData = { 'documents' : [{ 'id' : '1', 'text' : bodyStr, 'language' : 'en' }] };
	return new Promise(function(resolve,reject) {
		request({
			url: "https://aspencoreaicognitiveapi.cognitiveservices.azure.com/text/analytics/v2.1/entities",
			headers: {
				'Content-type' : 'application/json',
				'Ocp-Apim-Subscription-Key' : process.env.AZURE_ACCESS_KEY
			},
			body: JSON.stringify(jsonData),
			json : true	
		}, function(error, response, body) {
			if(error) {
				reject(error);
			}
			console.log(body);
			// Parsing response for 'Company' and 'Person' entities
			body.documents[0].entities.forEach(function(entity) {
				if(entity.type == "Organization") {
					azureOrgArray.push(entity.name)
				} else if(entity.type == "Person") {
					azurePersonArray.push(entity.name)
				}
			});
			console.log("Organization terms found: " + azureOrgArray);
			console.log("Person terms found: " + azurePersonArray);
			resolve([azurePersonArray,azureOrgArray]);
		});
	});
}

function awsResponse(bodyStr) {
	let awsOrgArray = [];
	let awsPersonArray = [];
	let comprehend = new aws.Comprehend();
	return new Promise(function(resolve,reject) {
		let params = {
			LanguageCode: 'en',
			Text: event.text 
		};
		comprehend.detectKeyPhrases(params, function(err, data) {
			if(err) {
				console.log(err, err.stack);
			} else {
				console.log(data);
				resolve(data);
			}
		});
	});
}
 
// Confirming RabbitMQ channel and queue connection
const open = amqp.connect("amqp://user:00031113@127.0.0.1:5672");
const queueName = "postIDQueue";

return open
    .then(conn => {
		return conn.createChannel();
    })
	.then(channel => {
		// Setting up consumer for "sampleQueue" to read in messages sent by server.js
		// This block of code is written utilizing the new ECS8 Async and Await functionality
		return channel.consume(queueName, async function(msgOrFalse) {
			let result = "No messages in queue";
			if (msgOrFalse !== false) {
				result = msgOrFalse.content.toString() + " : Message recieved at " + new Date();
				let postID = msgOrFalse.content.toString();
				//console.log(postID);
				let token = await tokenFunc().catch(error => console.log(error));
				//console.log(token);
				let bodyStr = await postResponse(token, postID).catch(error => console.log(error));
				//console.log(bodyStr);
				let wterms = await watsonResponse(bodyStr).catch(error => console.log(error));
				let aterms = await azureResponse(bodyStr).catch(error => console.log(error));
				orgTerms = array_unique(array_merge($wterms[1], $aterms[1]), SORT_REGULAR);
				personTerms = array_unique(array_merge($1terms[0], $aterms[0]), SORT_REGULAR);

				request({
					url: process.env.WORDPRESS_ROOT_PATH + "/wp-json/wp/v2/posts/" + postID,
					headers: {
						'Content-Type' : 'application/json',
					},
					auth: {'bearer' : token},
					method: "POST",
					json: true,
					body: {
						"fromServer" : "1",
						"terms" : {
							"people" : personTerms,
							"organization" : orgTerms,
							"concept" : wterms[2]
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
			console.log("\x1b[1;36m", "[-] ", result);
			console.log("-------------------------------------------------------------------------------------------------------|");
		});

	});


module.exports = {tokenFunc, postResponse, watsonResponse, azureOrgArray, open};