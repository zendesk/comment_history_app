(function() {

	return {
		comments: {},
		user_tz: "",
		MONTH_NAMES: [ "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" ],
		requests: {
			getAllComments: function(ticket_id, page) {
				return {
					url: helpers.fmt('/api/v2/tickets/%@/comments.json?include=users&page=%@', ticket_id, page)
				};
			},

			getUserInfo: function(user_id) {
				return {
					url: helpers.fmt('/api/v2/users/%@.json', user_id)
				};
			}
		},

		events: {
			'app.activated':'init',
			'keyup .search':'filterSearch',
			'click .attachmentLink': 'attachmentModal',
			'hidden #attachModal': 'modalCleanup',
			'click .show-more': 'toggleAttach',
			'click .show-less': 'toggleAttach',
			'click .show-table': 'expandTable'
		},

		init: function() {
			var user = this.currentUser();
			this.ajax('getUserInfo', user.id())
			.done(function(data){
				this.user_tz = data.user.time_zone;
			});
			this.comments = {};
			var ticket_id = this.ticket().id();
			var fetchedComments = this._paginate({
				request: 'getAllComments',
				entity: 'comments',
				id: ticket_id,
				page: 1,
				sideload: 'users'
			});

			fetchedComments
				.done(_.bind(function(data) {
						this.comments = data;
						this.mapAuthorsAndAttachments();
				}, this))
				.fail(_.bind(function() {
						services.notify("Something went wrong and we couldn't reach the REST API to retrieve all comment data", 'error');
				}, this));
		},

		filterSearch: function(e) {
			e.preventDefault();
			var input = this.$("#search_input").val();
			this.mapAuthorsAndAttachments(input);

		},


		mapAuthorsAndAttachments: function(filter) {
			var data = this.comments;
			var tabledata = [];
			_.each(data.entity, function(comment){
				var rowobj = {
					"username": "",
					"author_id":0,
					"date": "",
					"attachments": [],
					"hasMore": false,
					"comment": "",
					"private": false,
					"sortDate": ""
				};
				var comment_user = _.filter(data.sideload, function(user){return user.id === comment.author_id;});
				comment_user = comment_user[0];
				if (comment.public === false) rowobj.private = true;
				rowobj.username = comment_user.name;
				rowobj.date = this.makePrettyDate(comment.created_at);
				rowobj.sortDate = comment.created_at;
				rowobj.author_id = comment.author_id;
				var attachments = [];
				if (comment.attachments.length > 0) {
					_.each(comment.attachments, function(attachment){
						var name = attachment.file_name;
						var ext = name.split(".").pop();
						var upper = 16 - ext.length;
						if(name.length > 19) {
							var new_name = name.substr(0,upper).concat('...',ext);
							attachment.short_name = new_name;
						}
						else {
							attachment.short_name = name;
						}
						attachments.push(attachment);
					}.bind(this));
				}
				if (comment.attachments.length > 1) rowobj.hasMore = true;
				rowobj.attachments = attachments;
				rowobj.comment = "<div style=\" word-wrap: break-word; width: 250px;\"" + comment.html_body + "</div>";
				rowobj.comment = rowobj.comment.replace("<a", "<a style=\"color:white;\"");
				tabledata.push(rowobj);
			}.bind(this));
			var sorted = _.sortBy(tabledata, function(robj){
				return robj.sortDate;
			});
			sorted.reverse();
			var showAll;
			if(data.entity.length > 5) {
				showAll = true;
			}
			else {
				showAll = false;
			}
			if(!filter){
				this.switchTo('comments',{
					data: sorted,
					allBtn: showAll
				});
				//this.$("#search_input").focus();
				//removing jump to search input bug.
				this.$("a.toolt").tooltip({ html: true});
			}
			else if(filter === "") {
					this.switchTo('comments',{
						data: sorted,
						allBtn: showAll
					});
					//this.$("#search_input").focus();
					this.$("a.toolt").tooltip({ html: true});

				}
			else {
				var filtered_data = _.filter(sorted, function(row){
					return row.comment.toLowerCase().indexOf(filter.toLowerCase()) > -1;
				}.bind(this));
				var filtered_table = this.renderTemplate('filter', {
					data: filtered_data,
					allBtn: showAll
				});
				this.$('#table_box').replaceWith(filtered_table);
				this.$("a.toolt").tooltip({ html: true});
			}

			
		},

		expandTable: function(e){
			e.preventDefault();
			var hidden_table = this.$('table#history_table tbody tr:nth-child(1n+6)');
			var button = this.$("#table_toggle");
			var button_text = button.text();
			if (button_text === 'Show All') {
				hidden_table.show();
				button.text('Hide');
			}
			else {
				hidden_table.hide();
				button.text('Show All');
			}

		},

		toggleAttach: function(event) {
			event.preventDefault();
			var showLink = event.currentTarget;
			var content = event.currentTarget.nextElementSibling;
			this.$(content).toggleClass('hideContent showContent');
			this.$(showLink).toggleClass('show-more show-less');
			var x = this.$(showLink).text();
			if(x === "+") {
				this.$(showLink).text('-');
			} else {
				this.$(showLink).text('+');
			}
		},

		attachmentModal: function(event) {
			event.preventDefault();
			var a = event.currentTarget;
			var filename = a.innerText;
			var attachment_url = a.href;
			var mime_type = a.attributes.data_content_type.value;
			var image_html = '';

			if (mime_type.split("/")[0] === "image") {
				image_html = helpers.fmt('<img src="%@" class="modalImage" />', attachment_url);
				this.$("#imageBox").append(image_html);
				this.$("a#downloadFile").attr("href",attachment_url).attr("download", filename);
				this.$("#attachModal").modal({
					backdrop: true,
					show: true
				});
			}
			else {
				image_html = helpers.fmt('<img src="%@" class="modalImage notImage" />', this.assetURL('download.svg'));
				this.$("#imageBox").append(image_html).append("<p class=\"no-pre\">Preview not available for this file-type.");
				this.$("a#downloadFile").attr("href",attachment_url).attr("download", filename).text("Download");
				this.$("#attachModal").modal({
					backdrop: true,
					show: true
				});
			}
		},

		modalCleanup: function() {
			this.$("#imageBox").empty();
			this.$("a#downloadFile").empty();
		},


		makePrettyDate: function(ISOstring) {
			var date_obj = new Date(ISOstring);
			var offset =  this.DST(ISOstring) ? 1 : 0;
			var year = date_obj.getFullYear().toString();
			var month = date_obj.getMonth();
			var hours = date_obj.getHours();
			var local_hours = (hours - offset).toString();
			var minutes = date_obj.getMinutes().toString();
			var month_name = this.MONTH_NAMES[month];
			var day = date_obj.getDate().toString();
			if (minutes.length === 1) minutes = '0' + minutes;
			if (day.length === 1) day = '0' + day;
			if (minutes.length ===1) minutes = '0' + minutes;
			var nice_date_with_time = helpers.fmt('%@ %@, %@:%@', month_name, day, local_hours, minutes);
			return nice_date_with_time;
		},

		DST: function(ISOstring){
			var today = new Date(ISOstring);
			var yr = today.getFullYear();
			var dst_start = new Date("March 14, "+yr+" 02:00:00"); // 2nd Sunday in March can't occur after the 14th 
			var dst_end = new Date("November 07, "+yr+" 02:00:00"); // 1st Sunday in November can't occur after the 7th
			var day = dst_start.getDay(); // day of week of 14th
			dst_start.setDate(14-day); // Calculate 2nd Sunday in March of this year
			day = dst_end.getDay(); // day of the week of 7th
			dst_end.setDate(7-day); // Calculate first Sunday in November of this year
			if (today >= dst_start && today < dst_end){ //does today fall inside of DST period?
				return true; //if so then return true
			}
			else {
				return false; //if not then return false

			}
		},

		_paginate: function(a) {
			var results = {
				"entity":[],
				"sideload":[]
			};
			var initialRequest = this.ajax(a.request, a.id, a.page);
			// create and return a promise chain of requests to subsequent pages
			var allPages = initialRequest.then(function(data) {
					results.entity.push(data[a.entity]);
					results.sideload.push(data[a.sideload]);
					var nextPages = [];
					var pageCount = Math.ceil(data.count / 100);
					for (; pageCount > 1; --pageCount) {
							nextPages.push(this.ajax(a.request, a.id, pageCount));
					}
					return this.when.apply(this, nextPages).then(function() {
							var entities = _.chain(arguments)
									.flatten()
									.filter(function(item) {
											return (_.isObject(item) && _.has(item, a.entity));
									})
									.map(function(item) {
											return item[a.entity];
									})
									.value();
							results.entity.push(entities);
					}).then(function() {
							var neat_entity =  _.chain(results.entity)
									.flatten()
									.compact()
									.value();
							results.entity = neat_entity;
							var neat_sideload = _.chain(results.sideload)
								.flatten()
								.compact()
								.value();
							results.sideload = neat_sideload;
							return results;
					});
			});
			return allPages;
		}
	};

}());
