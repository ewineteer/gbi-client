gbi.widgets = gbi.widgets || {};

gbi.widgets.AttributeEditor = function(editor, options) {
    var self = this;
    var defaults = {
        element: 'attributemanager',
        alpacaSchemaElement: 'alpaca_schema',
        alpacaNonSchemaElement: 'alpaca_non_schema',
        allowNewAttributes: true
    };
    this.layerManager = editor.layerManager;
    this.options = $.extend({}, defaults, options);
    this.element = $('#' + this.options.element);
    this.selectedFeatures = [];
    this.featureChanges = {};
    this.invalidFeatures = [];
    this.selectedInvalidFeature = false;
    this.changed = false;
    this.labelValue = undefined;
    this.renderAttributes = false;
    this.changedAttributes = {};
    this.jsonSchema = this.options.jsonSchema || false;

    Alpaca.setDefaultLocale("de_AT");

    $.alpaca.registerView(gbi.widgets.AttributeEditor.alpacaViews.edit)
    $.alpaca.registerView(gbi.widgets.AttributeEditor.alpacaViews.display)

    var activeLayer = this.layerManager.active();
    var listenOn = activeLayer instanceof gbi.Layers.Couch ? 'gbi.layer.couch.loadFeaturesEnd' : 'gbi.layer.saveableVector.loadFeaturesEnd';
    if(!activeLayer.loaded) {
        $(activeLayer).on(listenOn, function() {
            self.render();
            $(activeLayer).off(listenOn, this);
        });
    }

    this.registerEvents();

    $(gbi).on('gbi.layermanager.vectorlayer.add', function(event, layer) {
        self.registerEvents(layer);
    });

    $(gbi).on('gbi.layermanager.layer.active', function(event, layer) {
        self.jsonSchema = layer.jsonSchema;
        self.render();
    })

    $(gbi).on('gbi.widgets.attributeEditor.deactivate', function(event) {
        if(self.layerManager.active()) {
            self.layerManager.active().setStyle({}, true);
            self.labelValue = undefined;
        }
    });


    self.render();
};

gbi.widgets.AttributeEditor.prototype = {
    CLASS_NAME: 'gbi.widgets.AttributeEditor',

    registerEvents: function(layer) {
        var self = this;
        var layers = [];
        if(layer) {
            layers = [layer];
        } else {
            layers = self.layerManager.vectorLayers;
        }
        $.each(layers, function(idx, layer) {
            layer.registerEvent('featureselected', self, function(f) {
                if(!(f.feature.id in self.featureChanges)) {
                    self.featureChanges[f.feature.id] = {'added': {}, 'edited': {}, 'removed': []};
                }
                self.jsonSchema = layer.jsonSchema || this.options.jsonSchema || false;
                if(self.invalidFeatures) {
                    var id = self._isInvalidFeature(f.feature);
                    if(id != -1) {
                        self.selectedInvalidFeature = self.invalidFeatures[id];
                    }
                }
                if($.inArray(f.feature, self.selectedFeatures) == -1) {
                    self.selectedFeatures.push(f.feature);
                }
                self.render();
                $('#attributeTab').tab('show');
            });
            layer.registerEvent('featureunselected', self, function(f) {
                if(self.selectedInvalidFeature && self.selectedInvalidFeature.feature.id == f.feature.id) {
                    self.selectedInvalidFeature = false;
                }
                var idx = $.inArray(f.feature, self.selectedFeatures);
                if(idx != -1) {
                    self.selectedFeatures.splice(idx, 1);
                    self.render();
                }
            });
        });
    },
    render: function() {
        var self = this;
        var attributes = [];
        var activeLayer = this.layerManager.active();
        self.invalidFeatures = $.isFunction(activeLayer.validateFeaturesAttributes) ? activeLayer.validateFeaturesAttributes() : [];
        if(activeLayer) {
            attributes = self.jsonSchema ? activeLayer.schemaAttributes() : this.renderAttributes || activeLayer.featuresAttributes();
        }
        this.element.empty();

        if(!self.jsonSchema) {
            this.element.append(tmpl(gbi.widgets.AttributeEditor.addSchemaTemplate));
            if(activeLayer) {
                $('#add_json_schema_url').click(function() {
                    $(activeLayer).on('gbi.layer.vector.schemaLoaded', function(event, schema) {
                        self.setJsonSchema(schema);
                        $(activeLayer).off('gbi.layer.vector.schemaLoaded');
                        $(activeLayer).off('gbi.layer.vector.loadSchemaFail');
                    });
                    $(activeLayer).on('gbi.layer.vector.loadSchemaFail', function(event, schema) {
                        $('#json_schema_load_fail').show().fadeOut(3000);
                        $(activeLayer).off('gbi.layer.vector.schemaLoaded');
                        $(activeLayer).off('gbi.layer.vector.loadSchemaFail');
                    });
                    var schemaURL = $('#json_schema_url').val();
                    activeLayer.addSchemaFromUrl(schemaURL);
                });
            } else {
                $('#add_json_schema_url').attr('disabled', 'disabled');
            }
        } else {
            this.element.append(tmpl(gbi.widgets.AttributeEditor.updateRemoveSchemaTemplate, {
                jsonSchemaURL: activeLayer.options.jsonSchemaUrl
            }));
            $('#refresh_json_schema').click(function() {
                $(activeLayer).on('gbi.layer.vector.schemaLoaded', function(event, schema) {
                    self.setJsonSchema(schema);
                    $(activeLayer).off('gbi.layer.vector.schemaLoaded');
                    $('#json_schema_refreshed').show().fadeOut(3000);
                });
                $(activeLayer).on('gbi.layer.vector.loadSchemaFail', function(event, schema) {
                    $('#json_schema_refresh_fail').show().fadeOut(3000);
                    $(activeLayer).off('gbi.layer.vector.schemaLoaded');
                    $(activeLayer).off('gbi.layer.vector.loadSchemaFail');
                });
                activeLayer.addSchemaFromUrl(activeLayer.options.jsonSchemaUrl);
            });
            $('#remove_json_schema').click(function() {
                activeLayer.removeJsonSchema();
                self.jsonSchema = false;
                self.render();
            });
        }

        if(self.invalidFeatures && self.invalidFeatures.length > 0) {
            self.renderInvalidFeatures(activeLayer);
        } else {
            self.selectedInvalidFeature = false;
        }

        if(self.selectedFeatures.length > 0) {
            if(self.editMode) {
                self.renderInputMask(attributes, activeLayer);
            } else {
                self.renderAttributeTable(attributes, activeLayer);
            }
        }

        //prepare list of all possible rendered attributes
        var renderedAttributes = [];
        if(self.jsonSchema) {
            renderedAttributes = activeLayer.schemaAttributes() || [];
        }
        if(this.renderAttributes) {
            $.each(this.renderAttributes, function(idx, attribute) {
                if($.inArray(attribute, renderedAttributes) == -1) {
                    renderedAttributes.push(attribute);
                }
            });
        }

        if (activeLayer) {
            $.each(activeLayer.featuresAttributes(), function(idx, attribute) {
                if($.inArray(attribute, renderedAttributes) == -1) {
                    renderedAttributes.push(attribute);
                }
            });
        }

        //bind events
        $.each(renderedAttributes, function(idx, key) {
            $('#'+key).keyup(function() {
                $('#save_btn').removeAttr('disabled').addClass('btn-success');
                self.changedAttributes[key] = true;
            });
            $('#_'+key+'_remove').click(function() {
                self.remove(key);
                return false;
            });
            $('#_'+key+'_label').click(function() {
                self.label(key);
                return false;
            });
        });
        $('#addKeyValue').click(function() {
            var key = $('#_newKey').val();
            var val = $('#_newValue').val();
            if (key && val) {
                self.add(key, val);
                self._applyAttributes();
            }
            return false;
        });
    },
    renderInvalidFeatures: function(activeLayer) {
        var self = this;
        this.element.append(tmpl(
            gbi.widgets.AttributeEditor.invalidFeaturesTemplate, {
                features: self.invalidFeatures
            }
        ));

        var id = -1;
        if(self.selectedInvalidFeature) {
            id = self._isInvalidFeature(self.selectedInvalidFeature.feature);
        }
        if(!self.selectedInvalidFeature || id == 0 || self.invalidFeatures.length == 1) {
            $('#prev_invalid_feature').attr('disabled', 'disabled');
        }  else {
            $('#prev_invalid_feature').removeAttr('disabled');
        }
        if(self.selectedInvalidFeature && (id >= self.invalidFeatures.length - 1 || self.invalidFeatures.length == 1)) {
            $('#next_invalid_feature').attr('disabled', 'disabled');
        } else {
            $('#next_invalid_feature').removeAttr('disabled');
        }

        $('#prev_invalid_feature').click(function() {
            var idx = id - 1;
            self.showInvalidFeature(idx, activeLayer);
        });

        $('#next_invalid_feature').click(function() {
            var idx = id + 1;
            self.showInvalidFeature(idx, activeLayer);
        });
    },
    showInvalidFeature: function(idx, activeLayer) {
        var self = this;
        self.selectedInvalidFeature = self.invalidFeatures[idx];
        activeLayer.selectFeature(self.selectedInvalidFeature.feature, true);
        activeLayer.showFeature(self.selectedInvalidFeature.feature);
    },
    renderSaveButton: function() {
        var self = this;
        self.element.append(tmpl(gbi.widgets.AttributeEditor.saveButtonTemplate));
        self.element.find('#save_btn').click(function() {
            var changedAttributes = Object.keys(self.changedAttributes);
            if(changedAttributes.length > 0) {
                $.each(changedAttributes, function(idx, attribute) {
                    self.edit(attribute, self.element.find('#' + attribute).val());
                });
            }
            self.changedAttributes = {};

            $(this).removeClass('btn-success').attr('disabled', 'disabled');
        });
    },
    renderInputMask: function(attributes, activeLayer) {
        var self = this;
        var selectedFeatureAttributes = {};
        var editable = true;

        $.each(self.selectedFeatures, function(idx, feature) {
            if(feature.layer != activeLayer.olLayer) {
                editable = false;
            }
        });

        if(self.jsonSchema) {
            var schemaOptions = {"fields": {}};
            var nonSchemaOptions = {"fields": {}};

            $.each(self.jsonSchema.properties, function(name, prop) {
                schemaOptions.fields[name] = {'id': name};
            });

            var nonSchema = {
                "title": attributeLabel.additionalProperties,
                "type": "object",
                "properties": {}
            }

            var data = {};
            $.each(this.selectedFeatures, function(idx, feature) {
                $.each(feature.attributes, function(key, value) {
                    //fill options for non schema
                    if(!(key in schemaOptions.fields) && !(key in nonSchemaOptions.fields)) {
                        nonSchemaOptions.fields[key] = {
                            'id': key,
                            'readonly': self.jsonSchema.additionalProperties === false
                        };
                    }

                    //check for different values for same attribute
                    if(key in data && data[key] != value) {
                        data[key] = undefined;
                        if(key in schemaOptions.fields) {
                            schemaOptions.fields[key]['placeholder'] = attributeLabel.sameKeyDifferentValue;
                        } else {
                            nonSchemaOptions.fields[key]['placeholder'] = attributeLabel.sameKeyDifferentValue;
                        }
                    } else {
                        data[key] = value;
                    }
                    //add key to nonSchema if not in jsonSchema and not already in nonSchema
                    if(!(key in self.jsonSchema.properties) && !(key in nonSchema.properties)) {
                        nonSchema.properties[key] = {
                            "type": "any",
                            "title": key
                        }
                    }
                })
            });

            this.element.append(tmpl(gbi.widgets.AttributeEditor.alpacaTemplate));
            $.alpaca(self.options.alpacaSchemaElement, {
                "schema": self.jsonSchema,
                "data": data,
                "options": schemaOptions,
                view: "VIEW_GBI_EDIT"
            });

            var nonSchemaView = self.jsonSchema.additionalProperties === false ? "VIEW_GBI_DISPLAY" : "VIEW_GBI_EDIT";
            $.alpaca(self.options.alpacaNonSchemaElement, {
                "schema": nonSchema,
                "data": data,
                "options": nonSchemaOptions,
                view: nonSchemaView
            });

            self.renderSaveButton();

            if(self.jsonSchema.additionalProperties !== false) {
                this.element.append(tmpl(gbi.widgets.AttributeEditor.newAttributeTemplate));
            } else {
                this.element.append($('<span>'+attributeLabel.addAttributesNotPossible+'.</span>'))
            }
        } else {
            $.each(this.selectedFeatures, function(idx, feature) {
                $.each(attributes, function(idx, key) {
                    var equal = true;
                    var value = feature.attributes[key];
                    if(key in selectedFeatureAttributes) {
                        equal = selectedFeatureAttributes[key].value == value;
                        if(!equal) {
                            selectedFeatureAttributes[key] = {'equal': false};
                        }
                    } else {
                        selectedFeatureAttributes[key] = {'equal': equal, 'value': value};
                    }
                });
            });
            this.element.append(tmpl(
                gbi.widgets.AttributeEditor.template, {
                    attributes: attributes,
                    selectedFeatureAttributes: selectedFeatureAttributes,
                    editable: editable
                }
            ));

            self.renderSaveButton();

            if(editable && this.options.allowNewAttributes) {
                this.element.append(tmpl(gbi.widgets.AttributeEditor.newAttributeTemplate));
            } else {
                this.element.append($('<span>'+attributeLabel.addAttributesNotPossible+'.</span>'))
            }
        }
    },
    add: function(key, value) {
        var self = this;
        $.each(this.selectedFeatures, function(idx, feature) {
            self.featureChanges[feature.id]['added'][key] = value;
        });
        this._applyAttributes();
        this.changed = true;
        this.render();
    },
    edit: function(key, value) {
        var self = this;
        $.each(this.selectedFeatures, function(idx, feature) {
            self.featureChanges[feature.id]['edited'][key] = value;
        });
        this.changed = true;
        this._applyAttributes();
        this.render();
    },
    remove: function(key) {
        var self = this;
        $.each(this.selectedFeatures, function(idx, feature) {
            if($.inArray(key, self.featureChanges[feature.id]['removed']) == -1) {
                self.featureChanges[feature.id]['removed'].push(key);
            }
        });
        this.changed = true;
        this._applyAttributes();
        if($.inArray(key, self.layerManager.active().featuresAttributes()) == -1) {
            self.label(key);
        }
        this.render();
    },
    label: function(key) {
        var symbolizers;
        if(this.labelValue == key) {
            symbolizers = {};
            $('#_' + key + '_label i')
                .removeClass('icon-eye-close')
                .addClass('icon-eye-open');
            this.labelValue = undefined;
        } else {
            var symbol = {'label': key + ': ${' + key + '}'};
            var symbolizers = {
                'Point': symbol,
                'Line': symbol,
                'Polygon': symbol
            };
            $('.add-label-button i')
                .removeClass('icon-eye-close')
                .addClass('icon-eye-open');
            $('#_' + key + '_label i')
                .removeClass('icon-eye-open')
                .addClass('icon-eye-close');
            this.labelValue = key;
        }
        this.layerManager.active().setStyle(symbolizers, true)
    },
    setAttributes: function(attributes) {
        this.renderAttributes = attributes;
        this.render();
    },
    setJsonSchema: function(schema) {
        this.jsonSchema = schema;
        this.render();
    },
    _applyAttributes: function() {
        var self = this;
        var activeLayer = this.layerManager.active();
        $.each($.extend(true, {}, this.featureChanges), function(featureId, changeSet) {
            var feature = activeLayer.featureById(featureId);
            if (feature) {
                // remove
                $.each(changeSet['removed'], function(idx, key) {
                    activeLayer.removeFeatureAttribute(feature, key);
                });
                self.featureChanges[feature.id]['removed'] = [];
                // edit
                $.each(changeSet['edited'], function(key, value) {
                    activeLayer.changeFeatureAttribute(feature, key, value);
                });
                self.featureChanges[feature.id]['edited'] = {};
                // add
                $.each(changeSet['added'], function(key, value) {
                    activeLayer.changeFeatureAttribute(feature, key, value)
                });
                self.featureChanges[feature.id]['added'] = {};

                // remove not selected features
                if($.inArray(feature, self.selectedFeatures) == -1) {
                    delete self.featureChanges[featureId];
                }

                if(self.selectedInvalidFeature && feature.id == self.selectedInvalidFeature.feature.id && activeLayer.validateFeatureAttributes(feature)) {
                    self.selectedInvalidFeature = false;
                }
            }
        });
    },
    _isInvalidFeature: function(feature) {
        var self = this;
        var id = -1
        $.each(self.invalidFeatures, function(idx, obj) {
            if(obj.feature.id == feature.id) {
                id = idx;
                return false;
            }
        });
        return id;
    },
    renderAttributeTable: function(attributes, activeLayer) {
        var self = this;
        var selectedFeatureAttributes = {};
        $.each(this.selectedFeatures, function(idx, feature) {
            $.each(attributes, function(idx, key) {
                var equal = true;
                var value = feature.attributes[key];
                if(key in selectedFeatureAttributes) {
                    equal = selectedFeatureAttributes[key].value == value;
                    if(!equal) {
                        selectedFeatureAttributes[key] = {'equal': false};
                    }
                } else {
                    selectedFeatureAttributes[key] = {'equal': equal, 'value': value};
                }
            });
        });
        self.element.append(tmpl(
            gbi.widgets.AttributeEditor.viewOnlyTemplate, {
                attributes: attributes,
                selectedFeaturesAttributes: selectedFeatureAttributes
            }
        ))
    }
};


var attributeLabel = {
    'noAttributes': OpenLayers.i18n("noAttributes"),
    'key': OpenLayers.i18n("key"),
    'val': OpenLayers.i18n("value"),
    'add': OpenLayers.i18n("add"),
    'formTitle': OpenLayers.i18n("addNewAttributesTitle"),
    'addAttributesNotPossible': OpenLayers.i18n("addAttributesNotPossible"),
    'sameKeyDifferentValue': OpenLayers.i18n("sameKeyDifferentValue"),
    'featuresWithInvalidAttributes': OpenLayers.i18n('Features with non valid attributes present'),
    'invalidFeaturesLeft': OpenLayers.i18n('features with invalid attributes left'),
    'next': OpenLayers.i18n('Next'),
    'prev': OpenLayers.i18n('Previous'),
    'additionalProperties': OpenLayers.i18n('Additional attributes'),
    'schemaViolatingAttribute': OpenLayers.i18n('This attribute is not defined in given schema. Remove it!'),
    'addJsonSchemaUrl': OpenLayers.i18n('Add JSONSchema URL'),
    'usedJsonSchema': OpenLayers.i18n('URL of used JSONSchema'),
    'successfulRefereshed': OpenLayers.i18n('Successful refreshed'),
    'schemaLoadFail': OpenLayers.i18n('Loading schema failed'),
    'schemaRefreshFail': OpenLayers.i18n('Refreshing schema failed'),
    'saveAttributeChanges': OpenLayers.i18n('Apply'),
    'label': OpenLayers.i18n('Show property in map'),
    'remove': OpenLayers.i18n('Remove property from feature')
};

var attributeTitle = {
    'refresh': OpenLayers.i18n('refresh'),
    'remove': OpenLayers.i18n('remove')
};

gbi.widgets.AttributeEditor.template = '\
    <% if(attributes.length == 0) { %>\
        <span>'+attributeLabel.noAttributes+'.</span>\
    <% } else { %>\
        <% for(var key in attributes) { %>\
            <form id="view_attributes" class="form-inline">\
                <label class="key-label" for="_<%=attributes[key]%>"><%=attributes[key]%></label>\
                <% if(selectedFeatureAttributes[attributes[key]]) { %>\
                    <% if(selectedFeatureAttributes[attributes[key]]["equal"]) {%>\
                        <input class="input-medium" type="text" id="<%=attributes[key]%>" value="<%=selectedFeatureAttributes[attributes[key]]["value"]%>" \
                    <% } else {%>\
                        <input class="input-medium" type="text" id="<%=attributes[key]%>" placeholder="'+attributeLabel.sameKeyDifferentValue+'" \
                    <% } %>\
                <% } else { %>\
                    <input class="input-medium" type="text" id="<%=attributes[key]%>"\
                <% } %>\
                <% if(!editable) { %>\
                    disabled=disabled \
                <% } %>\
                />\
                <% if(editable) { %>\
                <button id="_<%=attributes[key]%>_label" title="' + attributeLabel.label + '" class="btn btn-small add-label-button"> \
                    <i class="icon-eye-open"></i>\
                </button>\
                <button id="_<%=attributes[key]%>_remove" title="' + attributeLabel.remove + '" class="btn btn-small"> \
                    <i class="icon-remove"></i>\
                </button> \
                <% } %>\
            </form>\
        <% } %>\
    <% } %>\
';

gbi.widgets.AttributeEditor.newAttributeTemplate = '\
    <h4>'+attributeLabel.formTitle+'</h4>\
    <form class="form-horizontal"> \
         <div class="control-group"> \
            <label class="control-label" for="_newKey">'+attributeLabel.key+'</label> \
            <div class="controls">\
                <input type="text" id="_newKey" class="input-medium">\
            </div>\
        </div>\
         <div class="control-group"> \
            <label class="control-label" for="_newValue">'+attributeLabel.val+'</label> \
            <div class="controls">\
                <input type="text" id="_newValue" class="input-medium">\
            </div>\
        </div>\
        <button id="addKeyValue" class="btn btn-small">'+attributeLabel.add+'</button>\
    </form>\
';

gbi.widgets.AttributeEditor.alpacaTemplate = '\
    <div id="alpaca_schema"></div>\
    <div id="alpaca_non_schema"></div>\
';

gbi.widgets.AttributeEditor.invalidFeaturesTemplate = '\
    <div>\
        <h4>' + attributeLabel.featuresWithInvalidAttributes + '</h4>\
        <p><%=features.length%> ' + attributeLabel.invalidFeaturesLeft + '</p>\
        <button class="btn btn-small" id="prev_invalid_feature">' + attributeLabel.prev + '</button>\
        <button class="btn btn-small" id="next_invalid_feature">' + attributeLabel.next + '</button>\
    </div>\
';

gbi.widgets.AttributeEditor.addSchemaTemplate = '\
    <div>\
        <div class="input-append">\
            <input id="json_schema_url" name="json_schema_url" type="text" />\
            <button class="btn" id="add_json_schema_url" type="button">'+attributeLabel.addJsonSchemaUrl+'</button>\
        </div>\
        <div class="alert alert-error" style="display: none" id="json_schema_load_fail">' + attributeLabel.schemaLoadFail + '</div>\
    </div>\
';

gbi.widgets.AttributeEditor.updateRemoveSchemaTemplate = '\
    <div>\
        <span>' + attributeLabel.usedJsonSchema + ': <%=jsonSchemaURL%> </span>\
        <button class="btn btn-small" id="refresh_json_schema" title="' + attributeTitle.refresh + '"><i class="icon-refresh"></i></button>\
        <button class="btn btn-small" id="remove_json_schema" title="' + attributeTitle.remove + '"><i class="icon-remove"></i></button>\
    </div>\
    <div class="alert alert-success" style="display: none" id="json_schema_refreshed">' + attributeLabel.successfulRefereshed + '</div>\
    <div class="alert alert-error" style="display: none" id="json_schema_refresh_fail">' + attributeLabel.schemaRefreshFail + '</div>\
';

gbi.widgets.AttributeEditor.saveButtonTemplate = '\
    <div>\
        <button class="btn btn-small" disabled="disabled" id="save_btn">'+attributeLabel.saveAttributeChanges+'</button>\
    </div>\
';

gbi.widgets.AttributeEditor.alpacaViews = {
    "edit": {
        "id": "VIEW_GBI_EDIT",
        "parent": "VIEW_BOOTSTRAP_EDIT",
        "templates": {
            "controlFieldContainer": "\
            <div>\
                {{html this.html}}\
                <button id='_${id}_label' title='" + attributeLabel.label + "' class='btn btn-small add-label-button'>\
                    <i class='icon-eye-open'></i>\
                </button>\
                <button id='_${id}_remove' title='" + attributeLabel.remove + "' class='btn btn-small'>\
                    <i class='icon-trash'></i>\
                </button>\
            </div>"
        }
    },
    "display": {
        "id": "VIEW_GBI_DISPLAY",
        "parent": "VIEW_GBI_EDIT",
        "templates": {
            "fieldSetItemContainer": '<div class="alpaca-inline-item-container control-group error"></div>',
            "controlField": "\
                <div>\
                    {{html Alpaca.fieldTemplate(this,'controlFieldLabel')}}\
                    {{wrap(null, {}) Alpaca.fieldTemplate(this,'controlFieldContainer',true)}}\
                        {{html Alpaca.fieldTemplate(this,'controlFieldHelper')}}\
                    {{/wrap}}\
                    <span class='icon-exclamation-sign'></span>\
                    <span class='help-inline'>" + attributeLabel.schemaViolatingAttribute + "</span>\
                </div>\
            "
        }
    }
};

gbi.widgets.AttributeEditor.viewOnlyTemplate = '\
    <div>\
        <table class="table table-hover">\
            <thead>\
                <tr>\
                    <th>Key</th>\
                    <th>Value</th>\
                </tr>\
            </thead>\
            <tbody>\
            <% for(var key in attributes) { %>\
                <tr>\
                    <td><%=attributes[key]%></td>\
                    <td>\
                        <% if(selectedFeaturesAttributes[attributes[key]]["equal"]) {%>\
                            <%=selectedFeaturesAttributes[attributes[key]]["value"]%>\
                        <% } else {%>\
                            '+attributeLabel.sameKeyDifferentValue+'\
                        <% } %>\
                    </td>\
                    <td>\
                        <button id="_<%=attributes[key]%>_label" title="Show labels" class="btn btn-small add-label-button">\
                            <i class="icon-eye-open"></i>\
                        </button>\
                    </td>\
                </tr>\
            <% } %>\
            </tbody>\
        </table>\
    </div>\
';
