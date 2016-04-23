/*!
 * dragtable
 *
 * @Version 2.0.14
 *
 * Copyright (c) 2010-2013, Andres akottr@gmail.com
 * Dual licensed under the MIT (MIT-LICENSE.txt)
 * and GPL (GPL-LICENSE.txt) licenses.
 *
 * Inspired by the the dragtable from Dan Vanderkam (danvk.org/dragtable/)
 * Thanks to the jquery and jqueryui comitters
 *
 * Any comment, bug report, feature-request is welcome
 * Feel free to contact me.
 */

(function ($) {
    $.widget("akottr.dragtable", {
        options: {
            revert: false,               // smooth revert
            dragHandle: '.table-handle', // handle for moving cols, if not exists the whole 'th' is the handle
            maxMovingRows: 40,           // 1 -> only header. 40 row should be enough, the rest is usually not in the viewport
            excludeFooter: false,        // excludes the footer row(s) while moving other columns. Make sense if there is a footer with a colspan. */
            dragAccept: null,            // draggable cols -> default all
            persistState: null,          // url or function -> plug in your custom persistState function right here. function call is persistState(originalTable)
            restoreState: null,          // JSON-Object or function:  some kind of experimental aka Quick-Hack TODO: do it better
            exact: true,                 // removes pixels, so that the overlay table width fits exactly the original table width
            clickDelay: 10,              // ms to wait before rendering sortable list and delegating click event
            containment: null,           // @see http://api.jqueryui.com/sortable/#option-containment, use it if you want to move in 2 dimesnions (together with axis: null)
            cursor: 'move',              // @see http://api.jqueryui.com/sortable/#option-cursor
            cursorAt: false,             // @see http://api.jqueryui.com/sortable/#option-cursorAt
            distance: 0,                 // @see http://api.jqueryui.com/sortable/#option-distance, for immediate feedback use "0"
            tolerance: 'pointer',        // @see http://api.jqueryui.com/sortable/#option-tolerance
            axis: 'x',                   // @see http://api.jqueryui.com/sortable/#option-axis, Only vertical moving is allowed. Use 'x' or null. Use this in conjunction with the 'containment' setting
            beforeStart: $.noop,         // returning FALSE will stop the execution chain.
            beforeMoving: $.noop,
            beforeReorganize: $.noop,
            beforeStop: $.noop
        },
        sortableTable: {
            el: $(),
            selectedHandle: $(),
            movingRow: $(),
            columnMapping: []
        },

        _persistState: function () {
            var _this = this;
            this.element.find('th').each(function (i) {
                if (this.id !== '') {
                    _this._sortOrder[this.id] = i;
                }
            });
            $.ajax({
                url: this.options.persistState,
                data: this._sortOrder
            });
        },

        /*
         * persistObj looks like
         * {'id1':'2','id3':'3','id2':'1'}
         * table looks like
         * |   id2  |   id1   |   id3   |
         */
        _restoreState: function (persistObj) {
            for (var n in persistObj) {
                this._startIndex = $('#' + n).closest('th').prevAll().size() + 1;
                this._endIndex = parseInt(persistObj[n], 10) + 1;
                this._bubbleCols();
            }
        },

        // bubble the moved column left or right
        _bubbleCols: function () {
            var from = this._startIndex;
            var to = this._endIndex;

            // If dragged column was dragged back in its original place then there is no need to bubble columns
            // else bubble any effected columns
            if (from !== to) {

                var i, j, cols;

                // Gets all the table rows, using the jQuery children to only get the direct descendants
                var rows = this.options.excludeFooter ? this.element.children().not('tfoot').children()
                    : this.element.children().children();

                if (from < to) {
                    for (j = 0; j < rows.length; j++) {
                        cols = rows[j].children;
                        for (i = from; i < to; i++) {
                            this._swapNodes(cols[i - 1], cols[i]);
                        }
                    }
                } else {
                    for (j = 0; j < rows.length; j++) {
                        cols = rows[j].children;
                        for (i = from; i > to; i--) {
                            this._swapNodes(cols[i - 1], cols[i - 2]);
                        }
                    }
                }
            }

        },

        _rearrangeTableBackgroundProcessing: function () {
            var _this = this;
            return function () {
                if (_this._startIndex != _this._endIndex) {
                    var columnMapping = [];
                    for (var i = 0; i < _this.sortableTable.columnMapping.length; i++) {
                        var index = $(_this.sortableTable.columnMapping[i].handle).index();
                        if (i != index) {
                            columnMapping.push({
                                'handle': _this.element.find('thead > tr > th').eq(_this.sortableTable.columnMapping[i].originalPosition),
                                'originalPosition': i,
                                'newPosition': index,
                                'originalPositionDragAccept': _this.sortableTable.columnMapping[i].originalPositionDragAccept,
                                'newPositionDragAccept': $(_this.sortableTable.columnMapping[i].handle).prevAll('li.ui-sortable-handle').length
                            });
                        }
                    }
                    _this._bubbleCols();
                    _this.options.beforeStop(true, columnMapping);
                } else {
                    _this.options.beforeStop(false);
                }
                _this.sortableTable.el.remove();
                _this._restoreTextSelection();
                // persist state if necessary
                if (_this.options.persistState !== null) {
                    if (typeof(_this.options.persistState) === 'function') {
                        _this.options.persistState();
                    } else {
                        _this._persistState();
                    }
                }
            };
        },

        _rearrangeTable: function () {
            var _this = this;
            return function () {
                // remove handler-class -> handler is now finished
                _this._selectedHandle.removeClass('dragtable-handle-selected');
                // add disabled class -> reorganisation starts soon
                _this.sortableTable.el.sortable('disable').addClass('dragtable-disabled');
                _this.options.beforeReorganize();
                // do reorganisation asynchronous
                // for chrome a little bit more than 1 ms because we want to force a re-render
                _this._endIndex = _this.sortableTable.movingRow.prevAll().size() + 1;
                setTimeout(_this._rearrangeTableBackgroundProcessing(), 50);
            };
        },

        /*
         * Disrupts the table. The original table stays the same.
         * But on a layer above the original table we are constructing a list (ul > li)
         * each li with a separate table representing a single col of the original table.
         */
        _generateSortable: function (e) {
            !e.cancelBubble && (e.cancelBubble = true);

            var _this = this;

            var tempSortableTable = this.element[0].cloneNode(false);
            tempSortableTable.removeAttribute('id');

            var maxMovingRows = this.options.maxMovingRows;

            var tableHeader = this.element.children('thead');
            var tableHeaderRows = null;
            if (tableHeader.length > 0) {
                tableHeaderRows = Array.prototype.slice.call(tableHeader[0].children, 0, maxMovingRows);
                maxMovingRows = maxMovingRows - tableHeaderRows.length;
            }

            var tableBody = this.element.children('tbody');
            var tableBodyRows = null;
            if (maxMovingRows > 1 && tableBody.length > 0) {
                tableBodyRows = Array.prototype.slice.call(tableBody[0].children, 0, maxMovingRows);
            }

            var tableFooter = this.element.children('tfoot');
            var tableFooterRows = null;
            if (!this.options.excludeFooter && tableFooter.length > 0) {
                tableFooterRows = tableFooter[0].children;
            }

            var sortableUl = document.createElement('ul');
            sortableUl.className = 'dragtable-sortable';
            sortableUl.style.position = 'absolute';

            // compute total width, needed for not wrapping around after the screen ends (floating)
            var totalWidth = 0;

            var firstRowColumns = this.element.find('tr').first().children();

            // Build the sortable ul element
            firstRowColumns.each( function ( columnIndex, _ ) {

                var columnWidth = $(this).outerWidth();
                totalWidth += columnWidth;

                var sortableTableLi = document.createElement('li');
                sortableTableLi.style.width = columnWidth + 'px';

                var sortableTable = tempSortableTable.cloneNode(false);

                if (tableHeaderRows !== null) {
                    _this._cloneTableColumn(sortableTable, 'thead', tableHeaderRows, columnIndex);
                }

                if (tableBodyRows !== null) {
                    _this._cloneTableColumn(sortableTable, 'tbody', tableBodyRows, columnIndex);
                }

                if (tableFooterRows !== null) {
                    _this._cloneTableColumn(sortableTable, 'tfoot', tableFooterRows, columnIndex);
                }

                sortableTableLi.appendChild(sortableTable);
                sortableUl.appendChild(sortableTableLi);

                _this.sortableTable.columnMapping[columnIndex] = {
                    'handle': sortableTableLi,
                    'originalPosition': columnIndex,
                    'originalPositionDragAccept': _this.options.dragAccept ? $(this).prevAll(_this.options.dragAccept).length : columnIndex
                };
            });

            if (this.options.exact) {
                var difference = totalWidth - this.element.outerWidth();
                var firstColumnLi = sortableUl.children[0];
                var width = parseInt(firstColumnLi.style.width) - difference;
                firstColumnLi.children[0].style.width = width + 'px';
                firstColumnLi.style.width = width + 'px';
            }

            // one extra px on right and left side
            totalWidth += 2;

            sortableUl.style.width = totalWidth + 'px';

            this.sortableTable.el = this.element.before(sortableUl).prev();

            // assign this.sortableTable.selectedHandle
            this.sortableTable.selectedHandle = this.sortableTable.el.find('th .dragtable-handle-selected');

            var items = this.options.dragAccept ? 'li:has(' + this.options.dragAccept + ')' : 'li';

            this.sortableTable.el.sortable({
                items: items,
                stop: this._rearrangeTable(),
                // pass through options for sortable widget
                revert: this.options.revert,
                tolerance: this.options.tolerance,
                containment: this.options.containment,
                cursor: this.options.cursor,
                cursorAt: this.options.cursorAt,
                distance: this.options.distance,
                axis: this.options.axis
            });

            // assign start index
            this._startIndex = $(e.target).closest('th').prevAll().size() + 1;

            this.options.beforeMoving();

            // Start moving by delegating the original event to the new sortable table
            this.sortableTable.movingRow = this.sortableTable.el.children('li:nth-child(' + this._startIndex + ')');

            // prevent the user from drag selecting "highlighting" surrounding page elements
            this._disableTextSelection();

            // clone the initial event and trigger the sort with it
            this.sortableTable.movingRow.trigger($.extend($.Event(e.type), {
                which: 1,
                clientX: e.clientX,
                clientY: e.clientY,
                pageX: e.pageX,
                pageY: e.pageY,
                screenX: e.screenX,
                screenY: e.screenY
            }));

        },

        _create: function () {
            // initialize global variables
            this._startIndex = 0;
            this._endIndex = 0;
            this._sortOrder = {};


            this._bodyOnSelectStart = $(document.body).attr('onselectstart');
            this._bodyUnSelectable = $(document.body).attr('unselectable');

            // bind draggable to 'th' by default
            this._bindTo = this.element.find('th');

            // filter only the cols that are accepted
            if (this.options.dragAccept) {
                this._bindTo = this._bindTo.filter(this.options.dragAccept);
            }

            // bind draggable to handle if exists
            if (this._bindTo.find(this.options.dragHandle).size() > 0) {
                this._bindTo = this._bindTo.find(this.options.dragHandle);
            }

            // restore state if necessary
            if (this.options.restoreState !== null) {
                if (typeof(this.options.restoreState) === 'function') {
                    this.options.restoreState();
                } else {
                    this._restoreState(this.options.restoreState);
                }
            }

            var _this = this;

            this._bindTo.mousedown(function (evt) {
                // listen only to left mouse click
                if (evt.which === 1) {

                    if (_this.options.beforeStart() === false) {
                        return;
                    }

                    clearTimeout(_this.downTimer);

                    var srcElement = evt.target ? evt.target : evt.srcElement;

                    _this.downTimer = setTimeout(function () {
                        _this._selectedHandle = $(srcElement).addClass('dragtable-handle-selected');
                        _this._generateSortable(evt);
                    }, _this.options.clickDelay);

                }

            }).mouseup(function () {
                clearTimeout(_this.downTimer);
            });

        },

        _swapNodes: function (a, b) {
            var aParent = a.parentNode;
            var aSibling = a.nextSibling === b ? a : a.nextSibling;
            b.parentNode.insertBefore(a, b);
            aParent.insertBefore(b, aSibling);
        },

        _cloneTableColumn: function (parentTable, sectionTagName, sectionRows, columnIndex) {
            var tableSection = document.createElement(sectionTagName);
            for (var row = 0; row < sectionRows.length; row++) {
                var rowElm = sectionRows[row].cloneNode(false);
                var height = $(sectionRows[row]).outerHeight();
                rowElm.style.height = height + 'px';
                rowElm.appendChild(sectionRows[row].children[columnIndex].cloneNode(true));
                tableSection.appendChild(rowElm);
            }
            parentTable.appendChild(tableSection);
        },

        // A helper function which applies adds a CSS class to disable user selection
        // and removes any selections currently in the document

        _disableTextSelection: function () {
            // jQuery doesn't support the element.text attribute in MSIE 8
            // http://stackoverflow.com/questions/2692770/style-style-textcss-appendtohead-does-not-work-in-ie
            $(document.body).addClass('disable-select').attr({'onselectstart': 'return false;', 'unselectable': 'on'});

            if (window.getSelection) {
                window.getSelection().removeAllRanges();
            } else {
                // MSIE http://msdn.microsoft.com/en-us/library/ms535869%28v=VS.85%29.aspx
                document.selection.empty();
            }
        },

        // Removes the added class for disabling text selection,
        // and restores the selection attributes to the document body

        _restoreTextSelection: function () {

            $(document.body).removeClass('disable-select');

            if (this._bodyOnSelectStart) {
                $(document.body).attr('onselectstart', this._bodyOnSelectStart);
            } else {
                $(document.body).removeAttr('onselectstart');
            }

            if (this._bodyUnSelectable) {
                $(document.body).attr('unselectable', this._bodyUnSelectable);
            } else {
                $(document.body).removeAttr('unselectable');
            }

        },

        redraw: function () {
            this.destroy();
            this._create();
        },

        destroy: function () {
            this._bindTo.off('mousedown', 'mouseup');
            // default destroy
            $.Widget.prototype.destroy.apply(this, arguments);
            // now do other stuff particular to this widget
        }
    });

})(jQuery);
