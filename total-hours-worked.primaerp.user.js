// ==UserScript==
// @name        primaERP - Total Hours Worked
// @description Displays the total time worked in any week. Also fixes some bad translations.
// @author      Henrik Ilgen, https://github.com/henkoglobin; Johannes Feige,https://github.com/johannesfeige
// @version     0.0.4
// @grant       none
// @match       https://*.primaerp.com/
// @require     https://cdnjs.cloudflare.com/ajax/libs/rxjs/6.5.4/rxjs.umd.js
// ==/UserScript==

class TranslationService {
    fixCurrentWeekTranslation() {
        const weektime = window.messages.content.dashboard.panels.weektime;
        if (weektime.actual() == 'Actual week') {
            weektime.actual = function() {
                return 'Current week';
            };
        }
    }
}

class AdditionalTimesService {
    _weekStatisticsSelector = '#week-chart .desktop-panel-heading h2';
    _weekChartId = 'week-chart';
    _weekTimeChartId = 'week_time_chart';
    _weekReportRequestUrl = '/reports/ajaxWeekTimeReport';

    _monthDivPrefix = 'jofeHeil-month-';

    _dailyWorkHours = 8;
    _monthCount = 2;

    _startOfMonths = [...Array(this._monthCount).keys()].map((subtractValue) =>
        moment()
            .startOf('month')
            .subtract(subtractValue, 'month')
    );

    init() {
        this._createWeekTimeChartObserver();
        this._initMonths();
    }

    _initMonths = () => {
        this._startOfMonths.forEach((month) => {
            const $parent = $(`#${this._weekChartId}`).parent();
            const $monthDiv = $('<div>', { class: 'desktop-panel', id: this._getMonthDivId(month) }).appendTo($parent);
            const $heading = $('<div>', { class: 'desktop-panel-heading' }).appendTo($monthDiv);

            $('<h2>')
                .text(`${month.format('MMMM YYYY')}`)
                .appendTo($heading);

            $('<div>', { class: 'desktop-panel-body', id: this._getMonthDivComparisonId(month) }).appendTo($monthDiv);
        });
    };

    _createWeekTimeChartObserver = () => {
        const weekTimeChart = document.getElementById(this._weekTimeChartId);
        const options = { childList: true };
        const observer = new MutationObserver(this._updateTimes);

        observer.observe(weekTimeChart, options);

        return observer;
    };

    _updateTimes = () => {
        this._updateTotalTime();
        this._updateMonthTimes();
    };

    _updateTotalTime = () => {
        if (!window.weekChartData) {
            return;
        }

        const sum = window.weekChartData.sum((x) => x.value);
        document.querySelector(this._weekStatisticsSelector).innerHTML = `Week statistics (${sum}h)`;
    };

    _updateMonthTimes = () => {
        this._startOfMonths.forEach((month) => {
            this._getTimesPerMonth(month).then((data) => this._updateTimesPerMonth(data, month));
        });
    };

    _getTimesPerMonth = (startOfMonth) => {
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

            const request = new Request(this._weekReportRequestUrl);

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
            .then((data) => this._primaMonthPreparation(data, startOfMonth, endOfMonth));
    };

    /**
     * Preparation of months because ajayWeekTimeReport return whole week
     * (also including Days of previous or following months)
     * Also enchric target per day and moment date
     * @param {Array} data
     * @param {Date} startOfMonth
     * @param {Date} endOfMonth
     * @returns {Array} processed Data
     */
    _primaMonthPreparation = (data, startOfMonth, endOfMonth) => {
        const startOfMonthWeekDay = this._getNormalizedDayOfWeek(startOfMonth);
        const endOfMonthWeekDay = this._getNormalizedDayOfWeek(endOfMonth);

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
            item.targetHours = this._getDateTargetHours(item.momentDate);
            item.balance = item.value - item.targetHours;
            dateCounter++;
        });

        return data;
    };

    _updateTimesPerMonth = (data, startOfMonth) => {
        const times = [
            {
                title: 'Actual',
                value: data.sum((x) => x.value),
            },
            {
                title: 'Target',
                value: data.filter((x) => x.day !== 'Sat' && x.day !== 'Sun').length * this._dailyWorkHours,
            },
            {
                title: 'Balance (today)',
                value: data.filter((x) => x.momentDate <= moment()).sum((x) => x.balance),
            },
        ];

        const $comparisonDiv = $(`#${this._getMonthDivComparisonId(startOfMonth)}`);
        $comparisonDiv.empty();

        times.forEach((time) => {
            const $paragraph = $('<p>').appendTo($comparisonDiv);
            $paragraph.html(`${time.title}: ${time.value}`);
        });
    };

    _getMonthDivId = (month) => `${this._monthDivPrefix}${month.year()}-${month.month()}`;
    _getMonthDivComparisonId = (month) => `${this._getMonthDivId(month)}-comparison`;
    _getNormalizedDayOfWeek = (momentDate) => {
        const weekday = momentDate.weekday();
        return weekday === 0 ? 6 : weekday - 1;
    };
    _getDateTargetHours = (momentDate) =>
        momentDate.weekday() > 0 && momentDate.weekday() < 6 ? this._dailyWorkHours : 0;
}

(function(translationService, timesService) {
    translationService.fixCurrentWeekTranslation();
    timesService.init();
})(new TranslationService(), new AdditionalTimesService());
