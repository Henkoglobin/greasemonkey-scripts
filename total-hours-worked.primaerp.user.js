// ==UserScript==
// @name        primaERP - Total Hours Worked
// @description Displays the total time worked in any week.
// @author      Henrik Ilgen, https://github.com/henkoglobin
// @version     0.0.1
// @grant       none
// @match       https://*.primaerp.com/
// ==/UserScript==

(function() {
	function updateTotalTime() {
		const sum = [...document.querySelectorAll('#week-chart text')].map(x => x.innerHTML).filter(x => !isNaN(x)).reduce((x, y) => +x + +y);
		document.querySelector('#week-chart .desktop-panel-heading h2').innerHTML = `Week statistics (${sum}h)`;
	}

	window.setInterval(updateTotalTime, 1000);
})();
