(function() {
"use strict";

var content, search, term, results;
var subtitles = null;
var showctx = 0;
var videoid = yt.config_.VIDEO_ID || ytplayer.config.args.video_id; /* or YouTube Beta */

var tpls = {
	search: ' \
		<div id="ytverb-search" class="hide masthead-search-terms-border"> \
			<input type="text" id="ytverb-search-term" autocomplete="off" \
				placeholder="Search video subtitles..." \
				class="search-term masthead-search-renderer-input yt-uix-form-input-bidi"> \
			<ul id="ytverb-search-results" class="hide"></ul> \
		</div> \
	',
	searchitem: ' \
		<li><a href="%{href}" onclick="yt.www ? yt.www.watch.player.seekTo(%{seek}) : null; return false;"> \
			<span class="time">%{time}</span> \
			<span class="match"><b>%{prematch}</b> <i>%{match}</i> <b>%{postmatch}</b></span> \
		</a></li> \
	'
};

function $(s, ctx) {
	return (ctx||document).querySelector(s);
}

function trim(s) {
	return s.replace(/^([ ]*)/, "").replace(/([ ]*)$/, "");
}

function mkview(tpl, d) {
        var ret = tpl, re, k;

        for(k in d) {
                re = new RegExp("%{"+k+"}", 'g');
                ret = ret.replace(re , d[k]);
        }
        return ret;
}

function trigger(elems, evnm, data) {
	var ev, i, len;

	if(typeof elems == 'object' && elems.length == undefined)
		elems = [elems];
	len = elems.length;
	if(!len)
		return;
	ev = new CustomEvent(evnm, {detail:data});
	for(i = 0; i < len; ++i)
		elems[i].dispatchEvent(ev);
}

function striptags(html) {
	var t = document.createElement("div");

	t.innerHTML = html;
	return t.innerText;
}

function xmlparse_transcript(doc) {
	var d = [], i, len, v, nodes;

	nodes = doc.children;
	len = nodes.length;
	for(i = 0; i < len; ++i) {
		v = nodes[i].getAttribute("start");
		v = parseInt(v, 10) * 1000;
		d.push({
			time: v,
			ac: -1,
			text: trim(striptags(striptags(nodes[i].innerHTML)))
		});
	}
	return d;
}

function xmlparse_timedtext(doc) {
	var d = [], nodes, stag, i, ilen, j, jlen, pv, sv;

	/* XXX handle "format" attribute? */

	nodes = doc.children[doc.children.length - 1].children;
	ilen = nodes.length;
	for(i = 0; i < ilen; ++i) {
		if(nodes[i].tagName != "p")
			continue;
		pv = parseInt(nodes[i].getAttribute("t"), 10);
		jlen = nodes[i].children.length;
		if(!jlen) {
			d.push({
				time: pv,
				ac: nodes[i].getAttribute("ac"),
				text: trim(nodes[i].innerHTML)
			});
			continue;
		}

		/* handle s-tags */
		sv = 0;
		for(j = 0; j < jlen; ++j) {
			stag = nodes[i].children[j];
			if(stag.hasAttribute("t"))
				sv = parseInt(stag.getAttribute("t"), 10);
			d.push({
				time: pv + sv,
				ac: stag.getAttribute("ac"),
				text: trim(stag.innerHTML)
			});
		}
	}
	return d;
}

function xhrcmd(uri) {
	var cmd = uri.split('?')[0];

	cmd = cmd.substr(1 + cmd.lastIndexOf('/'));
	return cmd;
}

function xhrtrack(cmd, cb) {
	var xhrsend = XMLHttpRequest.prototype.send;

	XMLHttpRequest.prototype.send = function() {
		var onready = this.onreadystatechange;

		this.onreadystatechange = function() {
			if(this.readyState == 4 && xhrcmd(this.responseURL) == cmd)
				cb(this.responseXML);
			if(onready)
				onready.apply(this, arguments);
		}
		xhrsend.apply(this, arguments);
	};
}

function gotsubs(xml) {
	var doc = xml.children[0];

	switch(doc.tagName) {
	case "transcript":
		subtitles = xmlparse_transcript(doc);
		showctx = 0;
		break;
	case "timedtext":
		subtitles = xmlparse_timedtext(doc);
		showctx = doc.children.length != 1;
		break;
	default: /* format unrecognized */
		subtitles = null;
		break;
	}
	if(subtitles)
		searchval(term.value, 1); /* upgrade in background */
}

function searchkeys(ev) {
	var t;

	switch(ev.which) {
	case 38: /* ArrowUp */
		if(ev.type != "keydown")
			break;
		if(results.classList.contains("hide")) {
			results.classList.remove("hide");
			break;
		}
		t = $("li.selected", search);
		if(!t) {
			t = $("li:last-child", search);
		}
		else {
			t.classList.remove("selected");
			t = t.previousSibling.previousSibling;
		}
		if(!t)
			break;
		t.classList.add("selected");
		break;
	case 40: /* ArrowDown */
		if(ev.type != "keydown")
			break;
		if(results.classList.contains("hide")) {
			results.classList.remove("hide");
			break;
		}
		t = $("li.selected", search);
		if(!t) {
			t = $("li:first-child", search);
		}
		else {
			t.classList.remove("selected");
			t = t.nextSibling.nextSibling;
		}
		if(!t)
			break;
		t.classList.add("selected");
		break;
	case 13: /* Enter */
		t = $("li.selected a", search);
		if(!t)
			break;
		trigger(t, "click");
		results.classList.add("hide");
		break;
	case 27: /* Escape */
		results.classList.add("hide");
		break;
	default:
		/* XXX don't search if term.value has not changed:
		 * if(ev.type != "change") { ... } */
		searchval(term.value);
		return;
	}
	ev.stopPropagation();
	ev.preventDefault();
}

function searchrender(fields) {
	var html = "", len, d, i;

	for(i = 0, len = fields.length; i < len; ++i) {
		d = new Date(subtitles[fields[i]].time);
		d = {
			h: d.getUTCHours(),
			m: d.getUTCMinutes(),
			s: d.getUTCSeconds()
		};
		d = {
			prematch: "",
			postmatch: "",
			match: subtitles[fields[i]].text,
			href: ""
				+ "/watch?v="+videoid+"&t="
				+ (d.h ? d.h+"h" : "")
				+ (d.m ? d.m+"m" : "")
				+ d.s + "s",
			time: ""
				+ (d.h ? d.h+':' : "")
				+(d.m < 10 ? '0' : '') + d.m
				+':'+(d.s < 10 ? '0' : '') + d.s,
			seek: d.m*60+d.s
		};
		if(showctx) {
			d.prematch = (subtitles[fields[i] - 2] ? subtitles[fields[i]-2].text+" " : "")
					+ (subtitles[fields[i] - 1] ? " "+subtitles[fields[i]-1].text : "")
			d.postmatch = (subtitles[fields[i] + 1] ? subtitles[fields[i]+1].text+" " : "")
					+ (subtitles[fields[i] + 2] ? " "+subtitles[fields[i]+2].text : "")
		}
		html += mkview(tpls.searchitem, d);
	}
	return html;
}

function searchsubs(str, limit) {
	var ret = [], len = subtitles.length, i, j, wlen, words;

	if(!(str && len && limit > 0))
		return [];
	words = str.split(' ');
	wlen = words.length;
	for(i = 0, len = subtitles.length; i < len && limit; ++i) {
		if(subtitles[i].text == "\n")
			continue;
		for(j = 0; j < wlen; ++j) {
			if(subtitles[i].text.search(words[j]) == -1)
				continue;
			ret.push(i);
			--limit;
			break;
		}
	}
	return ret;
}

function searchval(v, bg) {
	v = trim(v);
	if(!(results.innerHTML = searchrender(searchsubs(v, 10)))) {
		results.classList.add("hide");
		return;
	}
	if(!bg)
		results.classList.remove("hide");
}

function setup_search() {
	search.addEventListener("keydown", searchkeys);
	search.addEventListener("keyup", searchkeys); /* XXX delay keyup events */
	search.addEventListener("change", searchkeys);
	search.addEventListener("focusin", function() {
		if(results.children.length)
			results.classList.remove("hide");
	});
	search.addEventListener("focusout", function() {
		/* XXX no better ways? */
		setTimeout(function() {
			results.classList.add("hide");
		}, 100);
	});
	search.addEventListener("mousemove", function(ev) {
		var cur = ev.target, sel = $("li.selected", search);

		while((cur = cur.parentNode) && cur != search)
			if(cur.tagName == "LI")
				break;
		if(cur == search)
			cur = null;
		if(sel == cur)
			return;
		if(sel)
			sel.classList.remove("selected");
		if(cur && cur.tagName == "LI")
			cur.classList.add("selected");
	});
}

function setup_toggle() {
	var btn = $(".ytp-subtitles-button"), search = $("#ytverb-search");

	btn.addEventListener("click", function() {
		if(btn.getAttribute("aria-pressed") == "true") {
			search.classList.remove("hide");
			term.focus();
		}
		else {
			search.classList.add("hide");
		}
	});
}

function main() {
	content = $("#watch7-content");

	/* prepare DOM */
	if(content) {
		content.innerHTML = tpls.search + content.innerHTML;
	}
	else {
		content = $("#player-container"); /* YouTube Beta */
		if(!content) {
			console.log("YouTube Verbatim: cannot play with this DOM.");
			return;
		}
		var d = document.createElement("div");

		d.innerHTML = tpls.search;
		content.parentNode.insertBefore(d, content.nextSibling.nextSibling);
		//content.innerHTML = content.innerHTML + tpls.search;
	}

	search = $("#ytverb-search");
	term = $("#ytverb-search-term");
	results = $("#ytverb-search-results");

	setup_search();
	setup_toggle();
	xhrtrack("timedtext", gotsubs);
}

/* Let's wait for the DOM to be ready. This allow to attach on YouTube Beta,
 * where developers had the great idea to use Polymer.
 * A "better" approach would be to wait only when in beta but this would make
 * main() more complex. I find this solution not so elegant but simpler.
 * For the moment. */
setTimeout(main, 1000);
})();
