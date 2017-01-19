function addjs(src) {
	var js = document.createElement("script");

	js.src = chrome.extension.getURL(src);
	document.getElementsByTagName("head")[0].appendChild(js);
}

function addcss(href) {
	var css = document.createElement("link");

	css.rel = "stylesheet";
	css.type = "text/css";
	css.href = chrome.extension.getURL(href);
	document.getElementsByTagName("head")[0].appendChild(css);
}

function main() {
	addjs("js/ytverb.js");
	addcss("css/ytverb.css");
}

main();
