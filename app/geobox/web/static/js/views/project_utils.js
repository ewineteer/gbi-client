var exportEdit = false;

function prepareRasterLayerJSON(rasterLayers) {
    var data = [];
    $.each(rasterLayers, function(idx, elem) {
        var elem = $(elem);
        var endLevel = elem.find('#end_level:enabled');
        if(endLevel.length) {
            endLevel = endLevel.val();
        } else {
            endLevel = null;
        }
        data.push({
            'source_id': elem.find('#raster_source').val(),
            'start_level': parseInt(elem.find('#start_level').val()),
            'end_level': parseInt(endLevel)
        });
    });
    return JSON.stringify(data);
}

function getDataVolume(editor) {
    var parser = new OpenLayers.Format.GeoJSON();
    var activeLayer = editor.layerManager.active();
    var data = {
        'raster_data': prepareRasterLayerJSON($('.raster_layer')),
        'coverage': parser.write(activeLayer.features)
    };

    if (exportEdit) {
        data['format'] = $("#format").val();
        data['srs'] = $("#srs").val();
    }

    $.post(getDataVolumeURL, data, function(result) {
        var volumenMB = Math.round(parseFloat(result['volume_mb']) * 100 ) / 100
        $('#data_volume').text(volumenMB);
        $('#data_tiles').text(result['total_tiles']);
        $('#data_tiles_max').text(result['max_tiles'] || '-');
        if (result['max_tiles'] > 0 && result['total_tiles'] > result['max_tiles']) {
            $('#data_tiles').addClass("label").addClass("label-important");
        } else {
            $('#data_tiles').removeClass("label").removeClass("label-important");
        }
    });

}

function verifyZoomLevel(element, editor) {
    var rasterLayer = $(element).parent();
    var startLevel = parseInt(rasterLayer.find('#start_level').val());
    var endLevel = parseInt(rasterLayer.find('#end_level').val());
    if(rasterLayer.find('#end_level:visible').length && startLevel > endLevel) {
        rasterLayer.find('.error_zoomlevel').show();
        toggleStartButton(editor);
    } else {
        rasterLayer.find('.error_zoomlevel').hide();
        toggleStartButton(editor);
    }
}

function toggleStartButton(editor) {
    var startButton = $('#start_btn');
    var activeLayer = editor.layerManager.active();
    if( ($('.raster_layer:visible').length && !$('.error_zoomlevel:visible').length && activeLayer.features.length) ||
        ($('.raster_layer:visible').length && !$('.error_zoomlevel:visible').length && exportEdit) )
    {
        startButton.removeAttr('disabled');
    } else if($('.vector_source:visible').length && !$('.raster_layer:visible').length) {
        startButton.removeAttr('disabled');
    } else {
        startButton.attr('disabled', 'disabled');
    }
}

function loadProjectCoverage(editor, couchdbCoverage) {
    var coverageID = $("#select_coverage").val();
    var data = {'id': coverageID, 'couchdb_coverage': couchdbCoverage};
    $.ajax({
        type: 'POST',
        url: loadCoverageURL,
        data: data,
        success: function(data) {
            if (data.coverage)
                loadFeatures(editor, data.coverage, couchdbCoverage);
        }
    });
    return false;
}


function loadCouchCoverage(editor) {
    var couchID = $("#select_couch").val();
    var polygons = [];
    if (couchLayers) {
        var selectedCouchLayer = couchLayers[couchID];
        if (selectedCouchLayer.features.length == 0) {
            $(gbi).on('gbi.layer.couch.loadFeaturesEnd', function(event, results) {
                loadCouchCoverage(editor);
                $(gbi).off('gbi.layer.couch.loadFeaturesEnd');
            });

            if (!selectedCouchLayer.olLayer.map) {
                editor.addLayer(selectedCouchLayer);
                selectedCouchLayer.olLayer.setVisibility(false);
            }

        } else {
            $.each(selectedCouchLayer.features, function(key, feature) {
                if (feature.geometry.CLASS_NAME == 'OpenLayers.Geometry.Polygon') {
                       polygons.push(feature);
                }
            });
            if (polygons.length > 0) {
                loadFeatures(editor, polygons);
            }
        }
    }

    return false;
}


function submitAndStart(editor) {
    $('#start').val("start");
    submitData(editor);
}

function submitData(editor) {
    if (exportEdit) {
       $('#raster_layers').val(prepareRasterLayerJSON($('.raster_layer')));
    }

    var parser = new OpenLayers.Format.GeoJSON();
    // deacative controls before saving the feautre
    editor.map.toolbars[0].deactivateAllControls();

    var activeLayer = editor.layerManager.active();
    if (activeLayer.features.length !== 0 ) {
        $('#coverage').val(parser.write(activeLayer.features));
    } else {
        $('#coverage').val(false);
    }
    $('#download_size').val(parseFloat($("#data_volume").text()));
}


