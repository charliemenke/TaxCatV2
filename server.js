
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

// Confirm channel is created and plublish the message glenned from POST request
function addMessage(message) {
	return open
		.then(connection => {
			return connection.createChannel();
		})
		.then(channel => {		
			channel.publish(exchangeName, "routingKey", Buffer.from(message.toString()));
			let msgTxt = message + " : Message send at " + new Date();
			console.log(" [+] %s", msgTxt);
			console.log("------------------------------------------------------------------------------------------------------|");
			return new Promise(resolve => {
				resolve(message);
			});
		});
}

// Very simple webserver listening specifically for POST requests wit postID params
app.use(express.json());
app.get('/', (req, res) => res.send('I think you ment to POST to ->/postID'));
app.post('/postID', (req, res) => {
	//console.log(req);
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
