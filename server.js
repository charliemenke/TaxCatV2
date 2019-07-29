
const request = require('request');
const express = require('express');
const app = express();
const amqp = require('amqplib');


const open = amqp.connect("amqp://localhost");
const exchangeName = "analysePostID";
const queueName = "postIDQueue";

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

function checkPostIDValilidy(message) {
	request({
			url: process.env.WORDPRESS_ROOT_PATH + "/wp-json/wp/v2/posts/" + message,
			method: "GET",
			headers: {}
			//auth: {'bearer' : JWTtoken}
		}, function(error,response,body) {
			if(error) {
				console.log(error);
				return false;
			}
			// Cleaning up response and parsing to JSON object
			bodyStr = body.substring(body.indexOf('{'));
			bodyStr = bodyStr.substr(0,bodyStr.lastIndexOf("}") + 1);
			bodyStr = JSON.parse(bodyStr);
			console.log(bodyStr);
			if(bodyStr.id) {
				return true;
			} else {
				console.log('resturning false');
				return false;
			}
		});
}

// Confirm channel is created and plublish the message glenned from POST request
function addMessage(message) {
	return open
		.then(connection => {
			return connection.createChannel();
		})
		.then(channel => {	
			if(message == 00000) {
				return;
			}	
			channel.publish(exchangeName, "routingKey", Buffer.from(message.toString()));
			let msgTxt = message + " : Message send at " + new Date();
			console.log("\x1b[1;32m", "[+] ", msgTxt);
			console.log("------------------------------------------------------------------------------------------------------|");
			return new Promise(resolve => {
				resolve(message);
			});
		});
}

// Very simple webserver listening specifically for POST requests with postID params
app.use(express.json());

app.get('/', (req, res) => res.send('I think you ment to POST to ->/postID'));
app.post('/postID', (req, res) => {
	if(!checkPostIDValilidy(req.body.postID)) {
		res.status(500).send();
	}
	addMessage(req.body.postID)
		.then(resp => {
			res.status(200).send();
		})
		.catch(err => {
			console.log("error:", err);
			res.status(500).send(err);
		});
});

app.listen(3000, () => console.log('Listening for WordPress POST on port 3000!'));

module.exports = app;
