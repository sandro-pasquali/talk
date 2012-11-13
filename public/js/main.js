$(function() {

mies
	//	Fetch routes and message pointers for those routes
	//
	.subscribe("/routes/fetch")
	.broadcast(function() {
	
		if(this.length < 1) {
			return alert("no messages");
		}
	
		$("#route-list").data({
			routes : this
		})
	})
	.error(function(error) {
		console.log(error);
	})
	
	//	Fetch the message bodies for a route conversation
	//
	.subscribe("/routes/mail/fetch*")
	.action(function(arg, action, data, route) {
		mies.publish(route);
	})
	.broadcast(function() {
		$("#route-messages").data({
			messages: this
		});
	})
	.error(function(error) {
		console.log(error);
	})

	.join("adhoc", function(err) {
		console.log("###")
		console.log(arguments);		
		
		mies.publish("routes/fetch");
	});

});