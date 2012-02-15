/*
 * gui-builder - A simple WYSIWYG HTML5 app creator
 * Copyright (c) 2011, Intel Corporation.
 *
 * This program is licensed under the terms and conditions of the
 * Apache License, version 2.0.  The full text of the Apache License is at
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 */
"use strict";

// Layout view widget

(function($, undefined) {

    $.widget('gb.layoutView', {

        options: {
            model: null,
            iframe: null,
            contentDocument: null,
        },

        _create: function() {
            var o = this.options,
                e = this.element;

            o.designReset = this._designResetHander;
            o.selectionChanged = this._selectionChangedHander;
            o.activePageChanged = this._activePageChangedHander;
            o.modelChanged = this._modelChangedHander;

            // FIXME: This should work, but $.extend of options seems to be
            //        creating a copy of the ADM, which will not containt the
            //        same nodes and events as the master
            //o.model = o.model || ADM || undefined;
            if (o.model) {
                this._bindADMEvents(o.model);
            }

            this.options.iframe = this.element.find('iframe');
            if (!this.options.iframe.length) {
                this.options.iframe = $('<iframe/>');
            }

            this.options.iframe.addClass(this.widgetName)
                .addClass('flex1')
                .appendTo(this.element);

            this.options.primaryTools = this._createPrimaryTools();
            this.options.secondaryTools = this._createSecondaryTools();

            this.options.contentDocument =
                $(this.options.iframe[0].contentDocument);

            $(window).resize(this, function(event) {
                var el = event.data.element,
                    doc = event.data.options.contentDocument,
                    iframe = event.data.options.iframe;
                // Force resize of the stage when containing window resizes
                el.height(el.parent().height());
                el.find('div').height(el.parent().height());
                // Force resize of the iframe when containing window resizes
                iframe.height(doc.height());
                iframe.css('min-height',
                            el.height() - 2
                            - parseFloat(iframe.css('margin-top'))
                            - parseFloat(iframe.css('margin-bottom'))
                            - parseFloat(iframe.css('padding-bottom'))
                            - parseFloat(iframe.css('padding-bottom')));
            });

            this.refresh(null, this);

            return this;
        },

        _setOption: function(key, value) {
            switch (key) {
                // Should this REALLY be done here, or plugin registration in
                // the "host"... using the functions mapped in widget options?
                case 'model':
                    this._unbindADMEvents(value);
                    this.options.model = value;
                    this._createDocument();
                    this.options.iframe.load(this, function(event) {
                        event.data._bindADMEvents(event.data.options.model);
                        event.data.loaded = true;
                        event.data.refresh(null, event.data);
                    });
                    break;
                default:
                    break;
            }
        },

        destroy: function() {
            // TODO: unbind any ADM event handlers
            $(this.element).find('.'+this.widgetName).remove();
            this.options.primaryTools.remove();
            this.options.secondaryTools.remove();
        },

        refresh: function(event, widget) {
            var name;
            widget = widget || event && event.data || this;
            name = (event)?(event.name)?event.name:event.type:'';

            if (!widget.loaded) return;

            if (!event) {
                widget._serializeADMDesignToDOM();
            } else if (event.type === 'load') {
                widget._serializeADMDesignToDOM();
            } else {
                switch (event.name) {
                    case 'designReset':
                        widget._serializeADMDesignToDOM();
                        break;
                    default:
                        console.warn(widget.widgetName,
                                     ':: Unexpected refresh request:',
                                     event.name);
                        return;
                        break;
                }
            }

            if (widget.options.contentDocument.length) {
                widget.options.contentDocument[0].defaultView
                    .postMessage('reload', '*');
            } else {
                console.error(widget.widgetName, ':: Missing contentDocument');
            }
        },

        // Private functions
        _createPrimaryTools: function() {
            return $('<div/>').addClass('hbox').hide()
                .append('<button class="ui-state-default">undo</button>')
                .append('<button class="ui-state-default">redo</button>')
                .append('<button class="ui-state-default">cut</button>')
                .append('<button class="ui-state-default">copy</button>')
                .append('<button class="ui-state-default">paste</button>');
        },

        _createSecondaryTools: function() {
            return $(null);
        },

        _bindADMEvents: function(a) {
            this.designRoot = a && a.getDesignRoot();
            a.bind("designReset", this._designResetHandler, this);
            a.bind("selectionChanged", this._selectionChangedHandler, this);
            a.bind("activePageChanged", this._activePageChangedHandler, this);
            this.designRoot.bind("modelUpdated",
                                 this._modelUpdatedHandler, this);
        },

        _unbindADMEvents: function(a) {
            this.designRoot = a && a.getDesignRoot();
            a.unbind("designReset", this._designResetHandler, this);
            a.unbind("selectionChanged", this._selectionChangedHandler, this);
            a.unbind("activePageChanged", this._activePageChangedHandler, this);
            this.designRoot.unbind("modelUpdated",
                                   this._modelUpdatedHandler, this);
        },

        _designResetHandler: function(event, widget) {
            widget = widget || this;
            this.designRoot = event.design ||
                              widget.options.model.getDesignRoot();
            widget.refresh(event, widget);
        },

        _selectionChangedHandler: function(event, widget) {
            var uid;
            widget = widget || this;

            // Always un-style currently selected nodes
            widget.options.contentDocument.find('.ui-selected')
                .removeClass('ui-selected');

            // Only apply selection style changes on valid nodes
            if (!event || (!event.uid && !event.node)) {
                return;
            }

            // Normally, ADM node id is provided in event.uid
            uid = event && event.uid;
            // Fallback is to try event.node.getUid()
            uid = uid || (event.node)?event.node.getUid():null;

            if (uid) {
                widget.options.contentDocument
                    .find('.adm-node[data-uid=\''+uid+'\']')
                    .not('[data-role=\'page\']')
                    .addClass('ui-selected').first().each(function() {
                        // Scroll selected node into view
                        this.scrollIntoViewIfNeeded();
                    });
            }
        },

        _activePageChangedHandler: function(event, widget) {
            var id, win,
                newPage = event && event.page, curPage;

            widget = widget || this;
            curPage = widget.options.model.getActivePage();

            // Only change if new page is valid
            if (!newPage) {
                return;
            }
            id = newPage.getProperty('id');

            // Only change if new page not the current page
            if (curPage && curPage.getUid() === id) {
                return;
            }

            win = widget.options.contentDocument[0].defaultView;

            if (win && win.$ && win.$.mobile) {
                win.$.mobile.changePage('#'+id);
            }
        },

        _modelUpdatedHandler: function(event, widget) {
            var win;

            widget = widget || this;

            serializeADMSubtreeToDOM(event.node, null, widget._renderer);

            win = widget.options.contentDocument[0].defaultView;

            if (win && win.$ && win.$.mobile) {
                win.$.mobile.activePage.page('destroy');
                win.$.mobile.activePage.page();
            } else {
                console.error(widget.widgetName, ':: Missing contentDocument');
            }
        },

        _createDocument: function() {
            var contents, doc;

            if (!this.designRoot) return;

            doc = this.options.contentDocument[0];
            doc.open();
            contents = this._serializeFramework(this.designRoot);
            doc.writeln(contents);
            doc.close();
        },

        _serializeFramework: function() {
            var start, end, ret, headers;

            headers = $.gb.getDesignHeaders();

            start = '<!DOCTYPE html>\n <html><head><title>Page Title</title>\n';
            end = "</head>\n<body>\n</body>\n</html>";

            if (headers && headers.length > 0) {
                ret = start + headers.join('\n') + end;
            } else {
                ret = start + end;
            }

            return ret;
        },

        _serializeADMDesignToDOM: function() {
            this.options.contentDocument.find('body >  div[data-role="page"]')
                .remove();
            serializeADMSubtreeToDOM(this.designRoot, null, this._renderer);
        },

        _renderer: function (admNode, domNode) {
            if (!domNode) {
                return;
            }

            // Attach the ADM UID to the element as an attribute so the DOM-id
            // can change w/out affecting our ability to index back into the
            // ADM tree
            // XXX: Tried using .data(), but default jQuery can't select on this
            //      as it's not stored in the element, but rather in $.cache...
            //      There exist plugins that add the ability to do this, but
            //      they add more code to load and performance impacts on
            //      selections
            $(domNode).attr('data-uid',admNode.getUid());

            // Add a special (temporary) class used by the JQM engine to
            // easily identify the "new" element(s) added to the DOM
            $(domNode).addClass('nrc-dropped-widget');

            // NOTE: if we bring back non-link buttons, we may need this trick
            // Most buttons can't be dragged properly, so we put them behind
            // the associated span, which can be dragged properly
            // if (!isLinkButton(admNode))
            //     $(domNode).css("z-index", "-1");

            $(domNode).addClass('adm-node');

            // If this node is "selected", make sure it's class reflects this
            if (admNode.isSelected()) {
                $(domNode).addClass('ui-selected');
            }

            // If this node is a "container", make sure it's class reflects this
            if (admNode.isContainer() || admNode.getType() === 'Header') {
                $(domNode).addClass('nrc-sortable-container');
                if (admNode.getChildrenCount() === 0) {
                    $(domNode).addClass('nrc-empty');
                } else {
                    $(domNode).removeClass('nrc-empty');
                }
            }
        },
    });
})(jQuery);