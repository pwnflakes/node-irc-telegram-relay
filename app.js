var irc = require('irc');
var irc_colors = require('irc-colors');
var https = require('https');
var request = require('request');
var imgur = require('imgur');
var fs = require('fs');

var config = JSON.parse(fs.readFileSync('./config.json'));
config.connected = false;

imgur.setClientId(config.imgur_api_key);

var bot = new irc.Client(config.server, config.botName, {
	channels: config.channels

});

bot.addListener('registered', function(message) {
	console.log('Relay bot connected.');

	if(!config.connected) {
		config.connected = true;
		fetchNewMessages();
	}
});

bot.addListener('error', function(xhr, test) {
	console.error(xhr);
});

bot.addListener('join' + config.channelToRelay, function(nick) {
	if(nick != config.botName) {
		sendToRelayGroup(nick + ' has joined ' + config.channelToRelay);
	}
});

bot.addListener('part' + config.channelToRelay, function(nick, reason, message) {
	if(nick != config.botName) {
		sendToRelayGroup(nick + ' has parted ' + config.channelToRelay);
	}
});

bot.addListener('kick' + config.channelToRelay, function(nick, by, reason, message) {
	sendToRelayGroup(by + ' has kicked ' + nick + ' from ' + config.channelToRelay + ': ' + message);
});

bot.addListener('message' + config.channelToRelay, function (nick, text, message) {
	sendToRelayGroup('<' + nick + '> ' + irc_colors.stripColorsAndStyle(text));
});

function sendToRelayGroup(message)
{
	var options = {
		host: 'api.telegram.org',
		path: '/' + config.telegram_token + '/sendMessage?chat_id=' + config.telegram_chatid + '&text=' + encodeURIComponent(message)
	};

	https.get(options).on('error', console.error);
}

function fetchNewMessages()
{
	setTimeout(fetchNewMessages, config.fetchInterval);

	var options = {
		host: 'api.telegram.org',
		path: '/' + config.telegram_token + '/getUpdates?offset=' + config.last_offset
	};

	var ret = '';
	https.get(options, function(res) {
		res.setEncoding('utf8');

		res.on('data', function (chunk) {
			ret += chunk;
		});

		res.on('error', function(err) {
			console.error(err);
		});

		res.on('end', function() {
			var updates = {};
			try {
				updates = JSON.parse( ret );
			} catch(e) {
				console.log(e);
				return;
			}

			if(updates && updates.ok == true && updates.result)
			{
				updates = updates.result;
				for(i in updates)
				{
					if(updates[i].message)
					{
						(function(curMessage) {
							if(curMessage.chat.id == config.telegram_chatid && !curMessage.photo && !curMessage.location)
							{
								bot.say(config.channelToRelay, curMessage.from.first_name +': ' + curMessage.text);
							}

							if(curMessage.location) {
								bot.say(config.channelToRelay, curMessage.from.first_name +'\'s location: https://www.google.com/maps?q=' + curMessage.location.latitude + ',' + curMessage.location.longitude);
							}

							if(curMessage.photo) {
								var curwidth = 0;
								var curFileId = '';
								for(j in curMessage.photo) {
									if(curMessage.photo[j].width > curwidth) {
										curwidth = curMessage.photo[j].width;
										curFileId = curMessage.photo[j].file_id;
									}
								}

								request('https://api.telegram.org/' + config.telegram_token + '/getFile?file_id=' + curFileId, function(err, res, body) {
									try {
										var img = JSON.parse(body);

										imgur.uploadUrl('https://api.telegram.org/file/' + config.telegram_token + '/' + img.result.file_path).then(function (json) {
											bot.say(config.channelToRelay, curMessage.from.first_name +': ' + json.data.link);
										})
									} catch(e) {
										console.error(e);
									}
								});

							}
						})(updates[i].message);			
					}

					config.last_offset = updates[i].update_id;
				}

				if(updates.length >= 1) config.last_offset++;
			}
		});

	}).on('error', console.error);	
}
