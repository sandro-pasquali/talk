var MailParser 	= require("mailparser").MailParser;

util.imapConnect = function(imap, box, cb) {
	if(typeof box === "function") {
		cb	= box;
		box = "INBOX";
	} 

	imap.connect(function(err) {
		if(err) {
			return cb(err);
		} 
		
		imap.openBox(box, false, function(err, mailbox) {
			if(err) {
				return cb(err);
			} 
			
			cb(null, mailbox)
		});
	})
};

util.imapSearch = function(imap, box, messages, cb) {
	util.imapConnect(imap, box, function(err, mailbox) {
	
		if(err) {
			return cb(err);
		}
		imap.search([ ['SUBJECT', 'waywot:'] ], function(err, results) {
			if(err) {
				return cb("Mail search failed.");
			}
	
			//	No results. Broadcast empty array.
			//
			if(results.length < 1) {
				return cb(null, []);
			}
	
			var fetch = imap.fetch(results, {
				request: {
					headers: ['subject', 'date', 'from'],
					body: false
				}
			});
	
			fetch.on('message', function(msg) {
				msg.on('end', function() {
					var subj = msg.headers.subject[0].split("waywot:")[1];
					
					messages[subj] = messages[subj] || [];
					messages[subj].push({
						seqno 		: msg.seqno,
						uid			: (box === "INBOX" ? "i" : "s") + msg.uid,
						flags 		: msg.flags,
						date		: msg.date,
						from		: msg.headers.from[0]
					})
				});
			});
			
			fetch.on('end', function() {
				cb(null, messages);
			});
			
		});
	});
}

util.imapFetchByUID = function(imap, boxes, box, messages, cb) {
	util.imapConnect(imap, box, function(err, mailbox) {
	
		if(err) {
			return cb(err);
		}
	
		var fetch = imap.fetch(boxes[box], {
			request: {
				body: 'full'
			}
		});
		
		var raw = [];
		fetch.on('message', function(msg) {
		
			var body = '';

			msg.on('data', function(chunk) {
				body += chunk.toString('utf8');
			});
			msg.on('end', function() {
				raw.push(body);
			});
		});
		
		fetch.on('end', function() {
		
			imap.logout();
			
			var parsedMsgs = []
			
			raw.forEach(function(mess) {
				var parser 	= new MailParser();
				parser.on("end", function(mailObj) {
					parsedMsgs.push(!!mailObj.html ? mailObj.html : mailObj.text);
					if(parsedMsgs.length === raw.length) {
						cb(null, parsedMsgs);
					}
				});
				parser.write(mess);
				parser.end();
			});
		});
	});
}