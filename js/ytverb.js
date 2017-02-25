(function() {

var content, search, term, results;
var subtitles = null;
var showctx = 0;

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
		<li><a href="%{href}" onclick="yt.www.watch.player.seekTo(%{seek}); return false;"> \
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
        var k, ret = tpl;

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

function searchsubs(str, limit) {
	var ret = [], len = subtitles.length, i, j, wlen, words;
	var gap = 1000, time = -1;

	if(!(str && len && limit > 0))
		return [];
	words = str.split(' ');
	wlen = words.length;
	for(i = 0; i < len && limit; ++i) {
		if(time != -1 && subtitles[i].time - time < gap)
			continue;
		for(j = 0; j < wlen; ++j) {
			if(subtitles[i].text.indexOf(words[j]) != -1) {
				ret.push(i);
				--limit;
				time = subtitles[i].time;
				break;
			}
		}
	}
	return ret;
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

function searchval(v, bg) {
	var fields, len, i, d;

	v = trim(v);
	fields = searchsubs(v, 10);
	len = fields.length;
	if(!len) {
		results.innerHTML = "";
		results.classList.add("hide");
		return;
	}
	/* render results */
	results.innerHTML = "";
	for(i = 0; i < len; ++i) {
		d = new Date(subtitles[fields[i]].time);
		d = {
			h: d.getUTCHours(),
			m: d.getUTCMinutes(),
			s: d.getUTCSeconds()
		};
		d = {
			prematch: showctx ? 
				(subtitles[fields[i] - 2] ? subtitles[fields[i]-2].text+" " : "")
				+ (subtitles[fields[i] - 1] ? " "+subtitles[fields[i]-1].text : "")
				: "",
			postmatch: showctx ?
				(subtitles[fields[i] + 1] ? subtitles[fields[i]+1].text+" " : "")
				+ (subtitles[fields[i] + 2] ? " "+subtitles[fields[i]+2].text : "")
				: "",
			match: subtitles[fields[i]].text,
			href: ""
				+ "/watch?v="+yt.config_.VIDEO_ID+"&t="
				+ (d.h ? d.h+"h" : "")
				+ (d.m ? d.m+"m" : "")
				+ d.s + "s",
			time: ""
				+ (d.h ? d.h+':' : "")
				+(d.m < 10 ? '0' : '') + d.m
				+':'+(d.s < 10 ? '0' : '') + d.s,
			seek: d.m*60+d.s
		};
		results.innerHTML += mkview(tpls.searchitem, d);
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
	content.innerHTML = tpls.search + content.innerHTML; /* prepare DOM */
	search = $("#ytverb-search");
	term = $("#ytverb-search-term");
	results = $("#ytverb-search-results");

	setup_search();
	setup_toggle();
	xhrtrack("timedtext", gotsubs);
}

main();
})();
