// ==UserScript==
// @name        primaERP - Total Hours Worked
// @description Displays the total time worked in any week. Also fixes some bad translations.
// @author      Johannes Feige, https://github.com/johannesfeige; Henrik Ilgen, https://github.com/henkoglobin
// @version     0.0.5
// @grant       none
// @match       https://*.primaerp.com/
// @require     https://cdnjs.cloudflare.com/ajax/libs/rxjs/6.5.4/rxjs.umd.js
// ==/UserScript==

class TranslationService {
    fixCurrentWeekTranslation() {
        const weektime = window.messages.content.dashboard.panels.weektime;
        if (weektime.actual() == 'Actual week') {
            weektime.actual = function () {
                return 'Current week';
            };
        }
    }
}

class UiService {
    MONTH_DIV_PREFIX = 'jofeHeil-month-';
    WEEK_CHART_ID = 'week-chart';
    WEEK_STATISTICS_SELECTOR = '#week-chart .desktop-panel-heading h2';
    WEEK_TIME_CHART_ID = 'week_time_chart';

    getWeekTimeChart = () => document.getElementById(this.WEEK_TIME_CHART_ID);

    updateTotalTime = (totalTime) =>
        (document.querySelector(this.WEEK_STATISTICS_SELECTOR).innerHTML = `Week statistics (${totalTime}h)`);
    updateTimesPerMonth = (startOfMonth, times) => {
        const $comparisonDiv = this._getMonthComparisonDiv(startOfMonth);
        $comparisonDiv.empty();

        times.forEach((time) => {
            const $paragraph = $('<p>').appendTo($comparisonDiv);
            $paragraph.html(`${time.title}: ${time.value}`);
        });
    };

    initWeekCharts = (startOfMonths) => {
        startOfMonths.forEach((startOfMonth) => {
            const $parent = $(`#${this.WEEK_CHART_ID}`).parent();
            const $monthDiv = $('<div>', {
                class: 'desktop-panel',
                id: this._getMonthDivId(startOfMonth),
            }).appendTo($parent);
            const $heading = $('<div>', { class: 'desktop-panel-heading' }).appendTo($monthDiv);

            $('<h2>')
                .text(`${startOfMonth.format('MMMM YYYY')}`)
                .appendTo($heading);

            $('<div>', {
                class: 'desktop-panel-body',
                id: this._getMonthComparisonDivId(startOfMonth),
            }).appendTo($monthDiv);
        });
    };

    _getMonthDivId = (month) => `${this.MONTH_DIV_PREFIX}${month.year()}-${month.month()}`;
    _getMonthComparisonDiv = (startOfMonth) => $(`#${this._getMonthComparisonDivId(startOfMonth)}`);
    _getMonthComparisonDivId = (startOfMonth) => `${this._getMonthDivId(startOfMonth)}-comparison`;
}

/**
 * @class
 */
class AdditionalTimesService {
    _weekReportRequestUrl = '/reports/ajaxWeekTimeReport';

    _dailyWorkHours = 8;
    _monthCount = 2;

    _startOfMonths = [...Array(this._monthCount).keys()].map((subtractValue) =>
        moment().startOf('month').subtract(subtractValue, 'month')
    );

    /**
     * @type {UiService}
     */
    _uiService;

    constructor(uiService) {
        this._uiService = uiService;
    }

    init() {
        this._createWeekTimeChartObserver();
        this._uiService.initWeekCharts(this._startOfMonths);
    }

    _createWeekTimeChartObserver = () => {
        const weekTimeChart = this._uiService.getWeekTimeChart();
        const options = { childList: true };
        const observer = new MutationObserver(this._weekTimeChartChangeHandler);

        observer.observe(weekTimeChart, options);

        return observer;
    };

    _weekTimeChartChangeHandler = () => {
        this._updateTotalTime();
        this._updateMonthTimes(this._startOfMonths, this._dailyWorkHours);
    };

    _updateTotalTime = () => {
        if (!window.weekChartData) {
            return;
        }

        const sum = window.weekChartData.sum((x) => x.value);
        this._uiService.updateTotalTime(sum);
    };

    _updateMonthTimes = (months, dailyWorkHours) => {
        months.forEach((month) => {
            this._getTimesPerMonth(month).then((data) => this._updateTimesPerMonth(data, dailyWorkHours));
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

    _updateTimesPerMonth = (data, dailyWorkHours) => {
        const [startOfMonth] = data;

        const times = [
            {
                title: 'Actual',
                value: data.sum((x) => x.value),
            },
            {
                title: 'Target',
                value: data.filter((x) => x.day !== 'Sat' && x.day !== 'Sun').length * dailyWorkHours,
            },
            {
                title: 'Balance (today)',
                value: data.filter((x) => x.momentDate <= moment()).sum((x) => x.balance),
            },
        ];

        this._uiService.updateTimesPerMonth(startOfMonth.momentDate, times);
    };

    _getNormalizedDayOfWeek = (momentDate) => {
        const weekday = momentDate.weekday();
        return weekday === 0 ? 6 : weekday - 1;
    };
    _getDateTargetHours = (momentDate) =>
        momentDate.weekday() > 0 && momentDate.weekday() < 6 ? this._dailyWorkHours : 0;
}

(function (translationService, timesService) {
    translationService.fixCurrentWeekTranslation();
    timesService.init();
})(new TranslationService(), new AdditionalTimesService(new UiService()));
