var sys = require('sys')
var exec = require('child_process').exec;
const express = require('express');
const app = express();
app.use(express.json());
app.get('/', (req, res) => res.send('Hello World!'));
app.post('/postID', (req, res) => {
	res.send('recived PostID!');
	function puts(error, stdout, stderr) { sys.puts(stdout) }
	exec("php wpAPI.php " + req.body.postID, function(err, stdout, stderr) {
  		console.log(stdout);
	});
	console.log(req.body.postID)
});
app.listen(3000, () => console.log('Listening for WordPress POST on port 3000!'));