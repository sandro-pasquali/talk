#!/usr/bin/env node

var https			= require('https');
var http			= require('http');
var fs 				= require('fs');
var express			= require('express');
var email			= require('mailer');
var crypto			= require('crypto');
var uuid 			= require('node-uuid');
var moment			= require('moment');

var imapConnection	= require('imap').ImapConnection;

var util 			= require('util');

//	Extends util object with some useful methods.
//
require("./lib/util.js");

var clio	= require("clio")({
	version : "0.1",
    options : {
        "-port"  	: "The port this server will run on",
        "-host"		: "The host to listen on",
        "-protocol"	: "HTTP or HTTPS"
    }
}).parse();

process.on('uncaughtException', function(err) {
	clio.write("@white@_red Error thrown in server.js: @yellow@_black " + err + " @@`");
	process.exit(0);
});

var port 		= clio.get("-port") || "443";
var host		= clio.get("-host") || "127.0.0.1";
var protocol	= clio.get("-protocol") || "https";

var publicServer	= protocol + "://" + host + ":" + port;
var server_config	= require("./config.json");

//	@see #auth
//
var authed = {};

//	All clients listening on broadcasts will be assigned to this map
//	with key being client's authenticated username (an email address).
//
//	@see	#receiveBroadcasts
//	@see	#broadcast
//
var broadcastClients = {};

//	Mapping of service type with imap endpoint.
//
var imapEndpoints = {
	"gmail.com"	: "imap.gmail.com",
	"yahoo.com"	: "imap.mail.yahoo.com"
};

//////////////////////////////////////////////////////////////////////////////////
//																				//
//								Configure HTTPS server							//
//																				//
//////////////////////////////////////////////////////////////////////////////////

var app = express();

app
//.use(express.compress())
//.use(function(req, res, next) {
//  req.forwardedSecure = (req.headers["x-forwarded-proto"] == "https");
//  next();
//})
.use(express.static('public'))
.use(express.bodyParser());

//////////////////////////////////////////////////////////////////////////////////
//																				//
//								Common methods									//
//																				//
//////////////////////////////////////////////////////////////////////////////////



//	##emailer
//
//	Note that this is using the `mailer` library, and requires a Sendgrid account.
//
var emailer = function(ob, cb) {

	ob = ob || {};

	var to		= ob.to;
	var from	= ob.from 		|| server_config.mailer_from;
	var subject	= ob.subject 	|| server_config.mailer_default_subj;
	var body	= ob.body;

	email.send({
		host			: "smtp.sendgrid.net",
		port 			: "25",
		domain			: "smtp.sendgrid.net",
		authentication	: "login",
		username		: server_config.mailer_username,
		password		: server_config.mailer_password,
		to 				: to,
		from 			: from,
		subject 		: subject,
		body 			: body
	}, cb);
};

var createHash = function() {
	return crypto.createHash('sha256').update(uuid.v4()).digest('hex');
};

var createAuthKey = function(email, password) {
	return email + "\x1B" + password;
}

//	##auth
//
var auth = express.basicAuth(function(email, password, fn) {

	var sp			= email.split("@");
	var name		= sp[0];
	var endpoint 	= imapEndpoints[sp[1] || "gmail.com"];

	if(!endpoint) {
		return fn(null, null);
	}

	var key = createAuthKey(email, password);

	if(authed[key]) {
		return fn(null, authed[key].email);
	}

	var imapDef = {
        username	: email,
        password	: password,
        host		: endpoint,
        port		: 993,
        secure		: true
    };

	var imap = new imapConnection(imapDef);

	imap.connect(function(err) {
		if(err) {
			return fn(null, null);
		}

		fn(null, (authed[key] = {
			email		: email,
			imapDef		: imapDef
		}));
	});

}, '');

//	Broadcast to all clients which have posted to /receiveBroadcasts.
//	Use this when you want to broadcast to a specific meeting (which is almost always).
//
//	@see	#wideBroadcast
//
var broadcast = function(msg, clientEmail, id) {
	var targ	= broadcastClients[clientEmail];
	if(typeof targ !== "object") {
		return;
	}

	id	= id || "adhoc";

	var outMsg = 'id:' + id + '\ndata: ' + JSON.stringify(msg) + '\n\n';

	targ.write(outMsg);
};

/*
	Create * route for this.


*/

//////////////////////////////////////////////////////////////////////////////////
//																				//
//									Routes										//
//																				//
//////////////////////////////////////////////////////////////////////////////////

//	Added for Talk exposure
//
app.post("/talk", function(req, res) {
	res.writeHead(200, {
		"content-type" : "application/json"
	});
	res.end(JSON.stringify(app.routes));
});

//	For every route extend request object with #callId and #broadcastType headers
//
app.all("*", function(req, res, next) {

	//	If authed, store password
	//
	var headers = req.headers;
	if(headers.authorization) {
		var token	= headers.authorization.split(/\s+/).pop()	|| ""; 	// 	The encoded auth token
		var auth	= new Buffer(token, 'base64').toString();   		// 	Convert from base64

		req.password	= auth.split(/:/)[1];
	}

	req.broadcastType 	= 1 * req.header('x-mies-broadcast');
	req.callId 			= req.header('x-mies-callid') || 'no-id-received';

	res.ok = function(status, data, headers) {
		headers	= headers || {};
		headers["content-type"] = "application/json";
		res.writeHead(status || 200, headers);
		res.end(JSON.stringify(data || {}));
	};

	//	If there is a #broadcastType then the error is against a mies call.
	//	We override the requested broadcast type, however, as call errors should
	//	not pollute everyones experience, even if requested.
	//
	//	If there is no #broadcastType then this is a non-mies request, which is
	//	handled in a more standard way.
	//
	res.error = function(message, status) {
		if(req.broadcastType) {
			broadcast({
				error:  message
			}, req.remoteUser, req.callId);
			res.end();
		} else {
			res.writeHead(status || 500, {});
			res.end(JSON.stringify(message || {}));
		}
	};

	next();
});

/*


	var clientEmail = req.remoteUser;
	var broadcastType = 1 * req.header('x-mies-broadcast');
	var callId = req.header('x-mies-callid') || 'no-id-received';

	broadcast(app.routes, clientEmail, callId);
*/

app.post("/routes/fetch", auth, function(req, res, next) {

	var talkCall = https.request({
		host: server.config.target_host || "127.0.0.1",
		port: server_config.target_port || "80",
		path: '/talk',
		method: 'POST',
		headers: {}
	}, function(response) {
		var data = ''
		response.on('data', function(chunk) {
			data += chunk;
		});
		response.on('end', function() {

			var routes	= JSON.parse(data);
			var def		= authed[createAuthKey(req.remoteUser, req.password)].imapDef;
			var imap;

			var preparedMessages = function(messages) {

				var out = [];
				var rOb;
				var meth;

				//	Clean routes: we only need specific info (the route def itself).
				//
				for(meth in routes) {
					routes[meth].forEach(function(info) {
						if(info.path !== "*") {
							rOb = {
								route		: info.path,
								method		: meth,
								messages	: messages[info.path] || [],
								uids		: {
									s : [],
									i : []
								}
							};
							rOb.messages.forEach(function(r) {

								var s = r.uid.split("");
								var t = s.shift();

								r.uid = s.join("");

								rOb.uids[t].push(r.uid.trim());
							});
							out.push(rOb);
						}
					});
				}

				return out;
			}

			imap = new imapConnection(def);

			util.imapSearch(imap, "INBOX", {}, function(err, msgs) {

				if(err) {
					return res.error(err);
				}

				imap.logout();
				imap 		= new imapConnection(def);

				util.imapSearch(imap, "[Gmail]/Sent Mail", msgs, function(err, msgs) {

					if(err) {
						return res.error(err);
					}

					broadcast(preparedMessages(msgs), req.remoteUser, req.callId);

					imap.logout();
				});
			})

			res.end();
		});
	});

	talkCall.write("");
	talkCall.end();
});

app.post('/routes/mail/fetch*', auth, function(req, res, next) {
	var inf = req.params[0];

	if(inf.length <= 1) {
		return res.ok();
	}

	inf = inf.split("|");

	var boxes = {
		"INBOX" 			: inf[0].split(","),
		"[Gmail]/Sent Mail" : inf[1].split(",")
	}

    var def		= authed[createAuthKey(req.remoteUser, req.password)].imapDef;
	var imap 	= new imapConnection(def);

	util.imapFetchByUID(imap, boxes, "INBOX", {}, function(err, first) {
		if(err) {
			return broadcast([], req.remoteUser, req.callId);
		}

		if(!!!boxes["[Gmail]/Sent Mail"][0]) {
			return broadcast(first, req.remoteUser, req.callId);
		}

		util.imapFetchByUID(new imapConnection(def), boxes, "[Gmail]/Sent Mail", first, function(err, second) {
			if(err) {
				return broadcast(first, req.remoteUser, req.callId);
			}

			broadcast(first.concat(second), req.remoteUser, req.callId);
		});
	});

	res.end();
});

//	##receiveBroadcasts
//
//	When a client wishes to receive broadcasts it should call this method.
//
app.post('/system/receive/:groupId', auth, function(req, res, next) {

	var clientEmail = req.remoteUser;

    res.writeHead(200, {
      'Content-Type'				: 'text/event-stream',
      'Cache-Control'				: 'no-cache',
      'Connection'					: 'keep-alive',
      'Access-Control-Allow-Origin'	: '*'
    });

	//	2kb padding for IE
	//
    res.write(':' + Array(2049).join(' ') + '\n');

	//	Any time a client exits (is no longer alive)
	//
    res.socket.on('close', function() {
		delete broadcastClients[clientEmail];
    });

	//	@see	#broadcast
	//
	broadcastClients[clientEmail] = res;

	//	Send the new client the email address it used to authenticate.
	//
	broadcast(clientEmail, clientEmail, req.params.groupId);

	//	Sends a ping every #pingInterval milliseconds. This avoids attempts of client
	//	to re-connect after inactivity (varies client to client). The client is sent
	//	the #pingInterval, allowing the client to implement some tracking of the server,
	//	and do something if the server doesn't ping again in approx. #pingIntervalTime.
	//
	(pinger = function() {
		res.write('id: ping\n');
		res.write("data: " + '{"interval":"' + server_config.ping_interval + '"}' + '\n\n');
		setTimeout(pinger, server_config.ping_interval);
	})();
});

//	##sendEmail
//
app.post('/sendEmail', auth, function(req, res, next) {

	//	Emails are always from the person sending.
	//
	req.body.from = req.remoteUser;

	emailer(req.body, function(err) {
		if(err) {
			return res.ok(400, err);
		}
		res.ok();
	});
});


//////////////////////////////////////////////////////////////////////////////////
//																				//
//								Start Server									//
//																				//
//////////////////////////////////////////////////////////////////////////////////

if(protocol === "https") {
	https.createServer({
		key		: fs.readFileSync('rsa/private-key.pem'),
		cert	: fs.readFileSync('rsa/public-cert.pem')
	}, app).listen(port);
} else {
	http.createServer(app).listen(port);
}

process.title = server_config.application_name;

console.log('Server running at ' + publicServer);


