// ==UserScript==
// @name        primaERP - Total Hours Worked
// @description Displays the total time worked in any week.
// @author      Henrik Ilgen, https://github.com/henkoglobin; Johannes Feige,https://github.com/johannesfeige
// @version     0.0.2
// @grant       none
// @match       https://*.primaerp.com/
// ==/UserScript==

(function() {
    function updateTotalTime() {
        if (!window.weekChartData) {
            return false;
        }
        const sum = window.weekChartData.sum((x) => x.value);
        document.querySelector('#week-chart .desktop-panel-heading h2').innerHTML = `Week statistics (${sum}h)`;
        console.info('Week total set to', sum);
        return true;
    }

    function createWeekTimeChartObserver() {
        const weekTimeChart = document.getElementById('week_time_chart');
        const options = { childList: true };
        const observer = new MutationObserver(() => {
            console.log('--observer--');
            updateTotalTime();
        });

        observer.observe(weekTimeChart, options);

        return observer;
    }

    createWeekTimeChartObserver();
})();
