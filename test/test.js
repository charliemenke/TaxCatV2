let reciever = require('../postidReciever.js');
let server = require('../server.js');
let chai = require('chai');
let chaiHttp = require('chai-http');
let should = chai.should();

chai.use(chaiHttp);
describe('Node Server', function() {
	describe('# /GET', function() {
		it('should respond with status 200 & a string message', (done) => {
			chai.request(server)
				.get('/')
				.end((err, res) => {
					res.should.have.status(200);
					res.text.should.equal('I think you ment to POST to ->/postID');
					done();
				});
		});
	});
	describe('# /POST PostID', function() {
		it('should respond with status 200', (done) => {
			chai.request(server)
				.post('/PostID')
				.send({ postID : 565150 })
				.end((err,res) => {
					res.should.have.status(200);
					done();
				});
		});
		it('should respond with status 500', (done) => {
			chai.request(server)
				.post('/PostID')
				.send({ postID : 00000 })
				.end((err,res) => {
					res.should.have.status(500);
					done();
				});
		});
	});
});