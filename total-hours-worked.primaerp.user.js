// ==UserScript==
// @name        primaERP - Total Hours Worked
// @description Displays the total time worked in any week. Also fixes some bad translations.
// @author      Henrik Ilgen, https://github.com/henkoglobin; Johannes Feige,https://github.com/johannesfeige
// @version     0.0.5
// @grant       none
// @match       https://*.primaerp.com/
// @require     https://cdnjs.cloudflare.com/ajax/libs/rxjs/6.5.4/rxjs.umd.js
// ==/UserScript==

window.Rx = rxjs;
const { distinct, map, tap, flatMap, mergeAll } = rxjs.operators;

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
        $(`div[id^="${this.MONTH_DIV_PREFIX}"]`).remove();
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

class AdditionalTimesService {
    _weekReportRequestUrl = '/reports/ajaxWeekTimeReport';

    _dailyWorkHours$;
    _monthCount$;
    _weekTimes$;
    _monthTimes$;
    _startOfMonths$;

    /**
     * @type {UiService}
     */
    _uiService;

    constructor(uiService) {
        this._uiService = uiService;

        this._dailyWorkHours$ = new Rx.BehaviorSubject(8);
        this._monthCount$ = new Rx.BehaviorSubject(2);

        this._weekTimes$ = new Rx.BehaviorSubject([]);
        this._monthTimes$ = new Rx.BehaviorSubject([]);

        this._startOfMonths$ = this._monthCount$.pipe(
            map((monthCount) => {
                return [...Array(monthCount).keys()].map((index) => moment().startOf('month').subtract(index, 'month'));
            })
        );

        window.updateDailyWorkHours = (value) => {
            this._dailyWorkHours$.next(value);
        };

        window.updateMonthCount = (value) => {
            this._monthCount$.next(value);
        };
    }

    init() {
        this._createWeekTimeChartObserver();

        this._weekTimes$.pipe(tap(this._updateTotalTime)).subscribe();

        this._startOfMonths$
            .pipe(
                tap((startOfMonths) => {
                    this._uiService.initWeekCharts(startOfMonths);
                })
            )
            .subscribe();

        Rx.combineLatest(this._startOfMonths$, this._dailyWorkHours$, this._weekTimes$)
            .pipe(
                flatMap(([startOfMonths, dailyWorkHours, weekTimes]) =>
                    Rx.iif(
                        () => weekTimes && weekTimes.length,
                        startOfMonths.map((startOfMonth) => this._getTimesPerMonth(startOfMonth))
                    ).pipe(
                        mergeAll(),
                        map((data) => this._enrichTargetHours(data, dailyWorkHours))
                    )
                ),
                tap(console.log),
                tap((data) => this._updateTimesPerMonth(data))
            )
            .subscribe();
    }

    _createWeekTimeChartObserver = () => {
        const weekTimeChart = this._uiService.getWeekTimeChart();
        const options = { childList: true };
        const observer = new MutationObserver(this._weekTimeChartChangeHandler);

        observer.observe(weekTimeChart, options);

        return observer;
    };

    _weekTimeChartChangeHandler = () => {
        if (this._weekTimes$.value !== window.weekChartData) {
            this._weekTimes$.next(window.weekChartData);
        }
    };

    _updateTotalTime = (weekTimes) => {
        if (!weekTimes) {
            return;
        }

        const sum = weekTimes.sum((x) => x.value);
        this._uiService.updateTotalTime(sum);
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

        return Rx.forkJoin(requests.map((x) => fetch(x.request, x.init))).pipe(
            flatMap((responses) => Rx.forkJoin(responses.map((response) => response.json()))),
            map((data) => data.flat(1)),
            map((data) => this._enrichPrimaTimes(data, startOfMonth, endOfMonth))
        );
    };

    /**
     * Preparation of months because ajayWeekTimeReport return whole week
     * (also including Days of previous or following months)
     * Also enriching moment date
     * @param {Array} data
     * @param {Date} startOfMonth
     * @param {Date} endOfMonth
     * @returns {Array} processed Data
     */
    _enrichPrimaTimes = (data, startOfMonth, endOfMonth) => {
        console.log('primaMonthPrep', data, startOfMonth, endOfMonth);
        const startOfMonthWeekDay = this._getNormalizedDayOfWeek(startOfMonth);
        const endOfMonthWeekDay = this._getNormalizedDayOfWeek(endOfMonth);

        if (startOfMonthWeekDay > 0) {
            data = data.slice(startOfMonthWeekDay, data.length);
        }

        if (endOfMonthWeekDay < 6) {
            const carryover = 6 - endOfMonthWeekDay;
            data.splice(-carryover, carryover);
        }

        return data.map((item, index) => ({
            ...item,
            momentDate: startOfMonth.clone().add(index, 'day'),
        }));
    };

    _enrichTargetHours = (data, dailyWorkHours) =>
        data.map((item) => {
            item.targetHours = this._getDateTargetHours(item.momentDate, dailyWorkHours);
            item.balance = item.value - item.targetHours;

            return item;
        });

    _updateTimesPerMonth = (data) => {
        const [startOfMonth] = data;

        const times = [
            {
                title: 'Actual',
                value: data.sum((x) => x.value),
            },
            {
                title: 'Target',
                value: data.sum((x) => x.targetHours),
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
    _getDateTargetHours = (momentDate, dailyWorkHours) =>
        momentDate.weekday() > 0 && momentDate.weekday() < 6 ? dailyWorkHours : 0;
}

(function (translationService, timesService) {
    translationService.fixCurrentWeekTranslation();
    timesService.init();
})(new TranslationService(), new AdditionalTimesService(new UiService()));
