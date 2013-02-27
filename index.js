"use strict";

var emproxy = require('emproxy');
var emsoap = require('emsoap');
var emutils = require('emutils');

var soaputils = emsoap.subsystems.soaputils;

var httpOptions;
var serviceType;
var operations;
var types;

var badEndpoint;

function init(proxyConfig) {
    httpOptions = emutils.clone(proxyConfig.httpOptions);
    serviceType = proxyConfig.serviceType;
    operations = proxyConfig.operations;
    types = emutils.arrayToObject(proxyConfig.types, "fullName");

    for (var typeName in types) {
        var type = types[typeName];
        if (type.baseTypeName) {
            type.baseType = types[soaputils.makeQname(type.baseTypeNs, type.baseTypeName)];
        }
    }

    for (var opName in operations) {
        var op = operations[opName];
        if (op.requestDesc && op.requestDesc.parts) {
            op.requestDesc.parts.forEach(function(part) {
                if (part.xmlType) {
                    part.type = types[soaputils.makeQname(part.xmlTypeNs, part.xmlType)];
                }
            });
        }
        if (op.responseDesc && op.responseDesc.parts) {
            op.responseDesc.parts.forEach(function(part) {
                if (part.xmlType) {
                    part.type = types[soaputils.makeQname(part.xmlTypeNs, part.xmlType)];
                }
            });
        }
    }

    for (var typeName in types) {
        var type = types[typeName];
        type.content.forEach(function(item) {
            if (item.xmlType) {
                item.type = types[soaputils.makeQname(item.xmlTypeNs, item.xmlType)];
            }
        });
    }

}

emproxy.init(function afterInitCallback(initialConfig) {
    console.dir(initialConfig);
    init(initialConfig);
    if (initialConfig.endpoint) {
        httpOptions = emsoap.subsystems.httpRequest.parseUrl(initialConfig.endpoint);
        if (httpOptions) {
            httpOptions.method="POST";
        }
        else {
            badEndpoint = initialConfig.endpoint;
            console.log("Unable to parse the SOAP endpoint URL '" + initialConfig.endpoint + "' .");
            console.log("The proxy will be unable to communicate with the target service.");
            console.log("Please supply a correctly formatted URL.")
        }
    }
    if (httpOptions && initialConfig.usename) {
        httpOptions.auth = initialConfig.username + ":" + initialConfig.password;
    }

emproxy.start(processDirective);
});

function processDirective(restRequest,callback) {
    var found = false;
    if (restRequest.op === 'INVOKE' && restRequest.targetType === serviceType) {
        var op = operations[restRequest.name];
        if (op) {
            found = true;
            callSoapOperation(restRequest.params, op, callback);
        }
    }

    if (!found) {
        return callback(new Error("Unsupported request type."));
    }
}

function callSoapOperation(input, op, callback) {
    if (op.inputParams) {
        for (var name in input) {
            var param = op.inputParams[name];
            if (param && param.parentName) {
                if (!input[param.parentName]) {
                    input[param.parentName] = {}
                }
                input[param.parentName][name] = input[name];
                delete input[name];
            }
        }
    }
    callSoap(input, httpOptions, op.requestDesc,
        op.deserializationOptions, op.responseDesc, callback);
}

function callSoap(input, httpOptions, requestDesc, deserOpts, responseDesc, cb) {
    if (badEndpoint) {
        cb(new Error("The proxy has been configured with the invalid endpoint '" + badEndpoint + "'"));
    }
    var opHttpOptions = emutils.clone(httpOptions);
    if (!opHttpOptions.headers) {
        opHttpOptions.headers = {};
    }
    opHttpOptions.headers.soapAction = requestDesc.soapAction;
    emsoap.call(input, httpOptions, requestDesc, deserOpts, responseDesc, function(err, result) {
        if (err) {
            cb(err);
        }
        else {
            var response = emutils.toArray(result);
            var restResponse = {
                status:"SUCCESS",
                count: response.length,
                results: response
            };
            cb(null, restResponse);
        }
    });
}
