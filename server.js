
const request = require('request');
const express = require('express');
const app = express();
const amqp = require('amqplib');

const port = process.env.PORT || 3000;
const open = amqp.connect("amqp://user:00031113@127.0.0.1:5672");
const exchangeName = "analysePostID";
const queueName = "postIDQueue";
require('dotenv').config();

// Set up RabbitMQ messesging queue and bind to exchange (This is done on both server and reciever side)
open
	.then(connection => {
		return connection.createChannel();
	})
	.then(channel => {
		return channel
			.assertExchange(exchangeName, "direct", {durable: true})
			.then(()=> {
				return channel.assertQueue(queueName, {exclusive: false});
			})
			.then(q => {
				return channel.bindQueue(q.queue, exchangeName, "routingKey");
			});
	})
	.catch(err => {
		console.log(err);
		process.exit(1);
	});

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
						reject(error)
					}
					body = body.substring(body.indexOf("{"));
					body = JSON.parse(body);
					if(body.code == "jwt_auth_valid_token") {
						resolve(info);
					}
				});
				*/
			}
		});
	});
}

function checkPostIDValilidy(message) {
	tokenFunc()
		.then(token => {
			request({
				url: process.env.WORDPRESS_ROOT_PATH + "/wp-json/wp/v2/posts/" + message,
				ContentType: 'application/json',
				method: "GET",
				headers: {},
				auth: {'bearer' : token},
				json: true
			}, function(error,response,body) {
				if(error) {
					console.log("error: ", error);
					return false;
				}
				// Cleaning up response and parsing to JSON object
				//console.log(body);
				let bodyStr = body.toString().substring(body.toString().indexOf('{'));
				//bodyStr = bodyStr.substr(0,bodyStr.lastIndexOf("}") + 1);
				//console.log(bodyStr);
				bodyStr = JSON.stringify(bodyStr);
				console.log(bodyStr);
				return new Promise(function(resolve,reject) {
					if(body.id) {
						console.log("returning true");
						resolve(true);
					} else {
						console.log("returning false");
						resolve(false);
					}
				});
				
			});
		});
	
}

// Confirm channel is created and plublish the message glenned from POST request
function addMessage(message, valid) {
	return open
		.then(connection => {
			return connection.createChannel();
		})
		.then(channel => {			
			return new Promise(resolve => {
				if(valid) {
					console.log("Valid Post! Sending ID.");
					channel.publish(exchangeName, "routingKey", Buffer.from(message.toString()));
					let msgTxt = message + " : Message send at " + new Date();
					console.log("\x1b[1;32m", "[+] ", msgTxt);
					console.log("------------------------------------------------------------------------------------------------------|");
					resolve(200);
				} else {
					console.log("Invalid Post, dropping message.");
					resolve(500);
				}
			});
		});
}

// Very simple webserver listening specifically for POST requests with postID params
app.use(express.json());

app.get('/', (req, res) => res.send('I think you ment to POST to ->/postID'));
app.post('/postID', async (req, res) => {
	try {
		let postValidity = await checkPostIDValilidy(req.body.postID);
		let status = await addMessage(req.body.postID, postValidity);
		res.status(status).send();
	} catch (e) {
		console.log("error:", e);
		res.status(500).send(e);
	}
});

app.listen(port, () => console.log('Listening for WordPress POST on port ' + port + '!'));

module.exports = app;
