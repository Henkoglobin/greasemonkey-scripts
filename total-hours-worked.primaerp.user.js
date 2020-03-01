// ==UserScript==
// @name        primaERP - Total Hours Worked
// @description Displays the total time worked in any week.
// @author      Henrik Ilgen, https://github.com/henkoglobin; Johannes Feige,https://github.com/johannesfeige
// @version     0.0.3
// @grant       none
// @match       https://*.primaerp.com/
// ==/UserScript==

(function() {
    const WEEK_STATISTICS_SELECTOR = '#week-chart .desktop-panel-heading h2';
    const WEEK_CHART_ID = 'week-chart';
    const WEEK_TIME_CHART_ID = 'week_time_chart';
    const WEEK_REPORT_REQUEST_URL = '/reports/ajaxWeekTimeReport';

    const MONTH_DEV_PREFIX = 'jofeHeil-month-';

    const DAILY_WORK_HOURS = 8;
    const MONTH_COUNT = 2;
    const START_OF_MONTHS = (() => {
        const result = [];

        for (let index = 0; index < MONTH_COUNT; index++) {
            result.push(
                moment()
                    .startOf('month')
                    .subtract(index, 'months')
            );
        }

        return result;
    })();

    const helper = getHelper();

    function updateTotalTime() {
        if (!window.weekChartData) {
            return false;
        }
        const sum = window.weekChartData.sum((x) => x.value);
        document.querySelector(WEEK_STATISTICS_SELECTOR).innerHTML = `Week statistics (${sum}h)`;

        return true;
    }

    function updateMonthTimes() {
        START_OF_MONTHS.forEach((month) => {
            getTimesPerMonth(month).then((data) => updateTimesPerMonth(data, month));
        });
    }

    function updateTimes() {
        updateTotalTime();
        updateMonthTimes();
    }

    function createWeekTimeChartObserver() {
        const weekTimeChart = document.getElementById(WEEK_TIME_CHART_ID);
        const options = { childList: true };
        const observer = new MutationObserver(() => updateTimes());

        observer.observe(weekTimeChart, options);

        return observer;
    }

    function initMonths() {
        START_OF_MONTHS.forEach((month) => {
            const $parent = $(`#${WEEK_CHART_ID}`).parent();

            const $monthDiv = $('<div>', { class: 'desktop-panel', id: helper.getMonthDivId(month) }).appendTo($parent);
            const $heading = $('<div>', { class: 'desktop-panel-heading' }).appendTo($monthDiv);
            $('<h2>')
                .text(`${month.format('MMMM YYYY')}`)
                .appendTo($heading);
            $('<div>', { class: 'desktop-panel-body', id: helper.getMonthDivComparisonId(month) }).appendTo($monthDiv);
        });
    }

    /**
     * Preparation of months because ajayWeekTimeReport return whole week
     * (also including Days of previous or following months)
     * Also enchric target per day and moment date
     * @param {Array} data
     * @param {Date} startOfMonth
     * @param {Date} endOfMonth
     * @returns {Array} processed Data
     */
    function primaMonthPreparation(data, startOfMonth, endOfMonth) {
        const startOfMonthWeekDay = helper.getNormalizedDayOfWeek(startOfMonth);
        const endOfMonthWeekDay = helper.getNormalizedDayOfWeek(endOfMonth);

        if (startOfMonthWeekDay > 0) {
            data = data.slice(startOfMonthWeekDay, data.length);
        }

        if (endOfMonthWeekDay < 6) {
            const carryover = 6 - endOfMonthWeekDay;
            data.splice(-carryover, carryover);
        }

        let dateCounter = 0;
        data.forEach((item) => {
            item.momentDate = startOfMonth.clone().add(dateCounter, 'day');
            item.targetHours = helper.getDateTargetHours(item.momentDate);
            item.balance = item.value - item.targetHours;
            dateCounter++;
        });

        return data;
    }

    function getTimesPerMonth(startOfMonth) {
        const endOfMonth = moment(startOfMonth).endOf('month');

        const startOfWeeks = [];
        for (let current = startOfMonth.clone(); current <= endOfMonth; current.add(1, 'day')) {
            if (current.weekday() === 1 || !startOfWeeks.length) {
                startOfWeeks.push(current.clone());
            }
        }

        const requests = startOfWeeks.map((week) => {
            const startWeek = window.pe.DateFormatter.ISOFromDate(week);
            const pastWeek = window.pe.DateFormatter.ISOFromDate(week.subtract(1, 'week'));

            const request = new Request(WEEK_REPORT_REQUEST_URL);

            const data = new FormData();
            data.append('startWeek', startWeek);
            data.append('startPastWeek', pastWeek);

            const init = {
                credentials: 'include',
                method: 'POST',
                body: data,
            };

            return {
                request,
                init,
            };
        });

        return Promise.all(requests.map((x) => fetch(x.request, x.init)))
            .then((responses) => Promise.all(responses.map((response) => response.json())))
            .then((data) => data.flat(1))
            .then((data) => primaMonthPreparation(data, startOfMonth, endOfMonth));
    }

    function updateTimesPerMonth(data, startOfMonth) {
        const times = [
            {
                title: 'Actual',
                value: data.sum((x) => x.value),
            },
            {
                title: 'Target',
                value: data.filter((x) => x.day !== 'Sat' && x.day !== 'Sun').length * DAILY_WORK_HOURS,
            },
            {
                title: 'Balance (today)',
                value: data.filter((x) => x.momentDate <= moment()).sum((x) => x.balance),
            },
        ];

        console.log({ data });

        const $comparisonDiv = $(`#${helper.getMonthDivComparisonId(startOfMonth)}`);
        $comparisonDiv.empty();

        times.forEach((time) => {
            const $paragraph = $('<p>').appendTo($comparisonDiv);
            $paragraph.html(`${time.title}: ${time.value}`);
        });
    }

    createWeekTimeChartObserver();
    initMonths();

    function getHelper() {
        const getMonthDivId = (month) => `${MONTH_DEV_PREFIX}${month.year()}-${month.month()}`;
        return {
            getMonthDivId,
            getMonthDivComparisonId: (month) => `${getMonthDivId(month)}-comparison`,
            getNormalizedDayOfWeek: (momentDate) => {
                let weekday = momentDate.weekday();
                return weekday === 0 ? 6 : weekday - 1;
            },
            getDateTargetHours: (momentDate) =>
                momentDate.weekday() > 0 && momentDate.weekday() < 6 ? DAILY_WORK_HOURS : 0,
        };
    }
})();
