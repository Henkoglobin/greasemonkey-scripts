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
const { distinctUntilChanged, map, tap, flatMap, mergeAll } = rxjs.operators;

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
    ADDITIONAL_SETTINGS_INSERT_SELECTOR = '.account > ul > li.divider:first';
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

    appendAdditionalSettingsMenu() {
        const $insertBefore = $(this.ADDITIONAL_SETTINGS_INSERT_SELECTOR);
        if ($insertBefore.length !== 1) {
            console.error(`Cannot find element for inserting additional settings`, { $accountMenu: $insertBefore });
            return;
        }

        const $link = $('<a>', {
            href: '#',
            text: 'Additional Settings',
        }).on('click', () => {
            this.openDialog();
        });
        const $additionalSettings = $('<li>').append($link);
        $additionalSettings.insertBefore($insertBefore);
    }

    openDialog() {
        const elements = [
            { id: 'dailyWorkHours', label: 'Daily Work Hours', value: 8 },
            { id: 'monthCount', label: 'Month Count', value: 2 },
        ];

        const $backdrop = this._openBackdrop();

        const $body = $('body');

        const $modalWrapper = $('<div>', {
            class: 'modal',
            style: 'display: block;',
        }).appendTo($body);

        const closeDialog = this._closeDialog.bind(this, $modalWrapper, $backdrop);

        const $dialogWrapper = $('<div>', {
            class: 'modal-dialog',
        }).appendTo($modalWrapper);

        const $dialog = $('<div>', {
            class: 'modal-content',
        }).appendTo($dialogWrapper);

        const $form = $('<form>', {
            class: 'form-horizontal',
        })
            .on('submit', (event) => {
                event.preventDefault();
                this._submitDialog($modalWrapper, $backdrop);
            })
            .appendTo($dialog);

        const $dialogHeader = $('<div>', {
            class: 'modal-header ui-draggable-handle',
        }).appendTo($form);

        const $dialogHeaderClose = $('<button>', {
            type: 'button',
            class: 'close',
        })
            .on('click', () => {
                closeDialog();
            })
            .appendTo($dialogHeader)
            .append(
                $('<span>', {
                    text: 'x',
                })
            );

        const $headerTitle = $('<h4>', {
            class: 'modal-title title',
            text: 'Additional Settings',
        }).appendTo($dialogHeader);

        const $dialogBody = $('<div>', {
            class: 'modal-body',
        }).appendTo($form);

        // const $row = $('<div>', {
        //     class: 'row',
        // }).appendTo($dialogBody);

        // const $col = $('<div>', {
        //     class: 'col-md-5',
        // }).appendTo($row);

        elements.forEach((element) => {
            const $formGroup = $('<div>', {
                class: 'form-group',
                size: '2',
            }).appendTo($dialogBody);

            const $label = $('<label>', {
                for: element.id,
                class: 'col-sm-2 control-label',
                text: element.label,
            }).appendTo($formGroup);

            const $inputWrapper = $('<div>', {
                class: 'col-sm-10',
            }).appendTo($formGroup);

            const $input = $('<input>', {
                class: 'form-control',
                name: element.id,
                id: element.id,
                value: element.value,
            }).appendTo($inputWrapper);
        });

        const $dialogFooter = $('<div>', {
            class: 'modal-footer',
        }).appendTo($form);

        const $close = $('<button>', {
            type: 'button',
            class: 'btn btn-link',
            text: 'Close',
        })
            .on('click', () => {
                closeDialog();
            })
            .appendTo($dialogFooter);

        const $save = $('<button>', {
            type: 'submit',
            class: 'btn btn-primary',
            text: 'Save',
        }).appendTo($dialogFooter);
    }

    _closeDialog($modalWrapper, $backdrop) {
        $modalWrapper.remove();
        $backdrop.remove();

        $('body').removeClass('modal-open modal-with-am-fade-an-slide-top');
    }

    _submitDialog($modalWrapper, $backdrop) {
        console.log('submit');

        this._closeDialog($modalWrapper, $backdrop);
    }

    _openBackdrop() {
        const $body = $('body');
        $body.addClass('modal-open modal-with-am-fade-an-slide-top');

        const $backdrop = $('<div>', {
            class: 'modal-backdrop am-fade',
            style: 'position: fixed; top: 0px; left: 0px; bottom: 0px; right: 0px; z-index: 1038;',
        });
        $body.prepend($backdrop);

        return $backdrop;
    }

    _getMonthDivId = (month) => `${this.MONTH_DIV_PREFIX}${month.year()}-${month.month()}`;
    _getMonthComparisonDiv = (startOfMonth) => $(`#${this._getMonthComparisonDivId(startOfMonth)}`);
    _getMonthComparisonDivId = (startOfMonth) => `${this._getMonthDivId(startOfMonth)}-comparison`;
}

class SettingsService {
    settings$ = new Rx.BehaviorSubject({
        dailyWorkHours: 8,
        monthCount: 2,
    });

    /**
     * @type {UiService}
     */
    _uiService;

    constructor(uiService) {
        this._uiService = uiService;

        this.init();
    }

    setDailyWorkHours(value) {
        this.settings$.next({
            ...this.settings$.value,
            dailyWorkHours: value,
        });
    }

    setMonthCount(value) {
        this.settings$.next({
            ...this.settings$.value,
            monthCount: value,
        });
    }

    init() {
        this._uiService.appendAdditionalSettingsMenu();
    }
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

    /**
     * @type {SettingsService}
     */
    _settingsService;

    constructor(uiService, settingsService) {
        this._uiService = uiService;
        this._settingsService = settingsService;

        this._dailyWorkHours$ = this._settingsService.settings$.pipe(
            map((settings) => settings.dailyWorkHours),
            distinctUntilChanged()
        );
        this._monthCount$ = this._settingsService.settings$.pipe(
            map((settings) => settings.monthCount),
            distinctUntilChanged()
        );

        this._weekTimes$ = new Rx.BehaviorSubject([]);
        this._monthTimes$ = new Rx.BehaviorSubject([]);

        this._startOfMonths$ = this._monthCount$.pipe(
            map((monthCount) => {
                return [...Array(monthCount).keys()].map((index) => moment().startOf('month').subtract(index, 'month'));
            })
        );
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
                tap((data) => console.log('after enriching - ', { data })),
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
        console.log('primaMonthPrep -', 'data count:', data.length);
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

const translationService = new TranslationService();
const uiService = new UiService();
const settingsService = new SettingsService(uiService);
const additionalTimesService = new AdditionalTimesService(uiService, settingsService);

window.setDailyWorkHours = settingsService.setDailyWorkHours.bind(settingsService);
window.setMonthCount = settingsService.setMonthCount.bind(settingsService);

(function (translationService, timesService) {
    translationService.fixCurrentWeekTranslation();
    timesService.init();
})(translationService, additionalTimesService);
