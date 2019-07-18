
const express = require('express');
const app = express();
const amqp = require('amqplib');


var open = amqp.connect("amqp://localhost");

open
	.then(connection => {
		return connection.createChannel();
	})
	.then(channel => {
		return channel
			.assertExchange("sampleExchange", "direct", {durable: true})
			.then(()=> {
				return channel.assertQueue("sampleQueue", {exclusive: false});
			})
			.then(q => {
				return channel.bindQueue(q.queue, "sampleExchange", "routingKey");
			});
	})
	.catch(err => {
		console.log(err);
		process.exit(1);
	});


function addMessage(message) {
	console.log("PostID: " + message);
	return open
		.then(connection => {
			return connection.createChannel();
		})
		.then(channel => {		
			channel.publish("sampleExchange", "routingKey", Buffer.from(message.toString()));
			let msgTxt = message + " : Message send at " + new Date();
			console.log(" [+] %s", msgTxt);
			return new Promise(resolve => {
				resolve(message);
			});
		});
}


app.use(express.json());
app.get('/', (req, res) => res.send('Hello World!'));
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

/*

var sys = require('sys')
var exec = require('child_process').exec;

function puts(error, stdout, stderr) { sys.puts(stdout) }
	exec("php wpAPI.php " + req.body.postID, function(err, stdout, stderr) {
  		console.log(stdout);
	});

*/