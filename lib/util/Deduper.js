var RequireContext = require('./RequireContext');
var ok = require('assert').ok;

var requireContextKey = 'dependency-require';

function Deduper(optimizerContext, dependencies) {
    ok(optimizerContext, '"optimizerContext" is required');
    ok(dependencies, '"dependencies" is required');

    /*
     * NOTE: The use of "phaseData" was necessary because we want to keep a cache that is independent of
     * for each phase of the optimization process. The optimization is separated into phases such as "app-bundle-mappings",
     * "page-bundle-mappings", "async-page-bundle-mappings", etc. We use the "requireContext" to prevent adding the same
     * require dependencies over and over again.
     */
    var requireContext = optimizerContext.phaseData[requireContextKey] ||
        (optimizerContext.phaseData[requireContextKey] = new RequireContext());

    this.dependencies = dependencies;
    this.requireContext = requireContext;
    this.addedDefDependencies = requireContext.addedDefDependencies;
    this.addedRunDependencies = requireContext.addedRunDependencies;
    this.addedDepDependencies = requireContext.addedDepDependencies;
    this.addedMainDependencies = requireContext.addedMainDependencies;
    this.addedRemapDependencies = requireContext.addedRemapDependencies;
    this.addedRequireDependencies = requireContext.addedRequireDependencies;
}

Deduper.prototype = {
    _addDependency: function(d, key, addedDependencies) {
        if (!addedDependencies[key]) {
            addedDependencies[key] = true;
            this.dependencies.push(d);
        }
    },
    addDef: function(d) {
        var key = d.path;
        this._addDependency(d, key, this.addedDefDependencies);
    },
    addRun: function(d) {
        var key = d.path + '|' + d.wait;
        this._addDependency(d, key, this.addedDefDependencies);
    },
    addDep: function(d) {
        var key = d.parentPath + '|' + d.childName + '|' + d.childVersion + '|' + d.remap;
        this._addDependency(d, key, this.addedDefDependencies);
    },
    addMain: function(d) {
        var key = d.main + '|' + d.dir;
        this._addDependency(d, key, this.addedDefDependencies);
    },
    addRemap: function(d) {
        var key = d.from + '|' + d.to;
        this._addDependency(d, key, this.addedDefDependencies);
    },
    addRequire: function(d) {
        var key;

        if (d._resolved) {
            key = d._resolved.filePath;
        } else if (d.resolvedPath) {
            key = d.resolvedPath;
        } else {
            key = d.path + '@' + d.from;
        }

        if (d.async) {
            key += d.async;
        }

        if (d.root) {
            key += d.root;
        }

        if (d.run) {
            key += d.run;
        }

        if (d.wait) {
            key += d.wait;
        }


        this._addDependency(d, key, this.addedDefDependencies);
    },
    addClient: function(clientDependency) {
        if (this.requireContext.clientIncluded === false) {
            this.dependencies.push(clientDependency);
            this.requireContext.clientIncluded = true;
        }
    },
    addReady: function(readyDependency) {
        if (this.requireContext.readyIncluded === false) {
            // Add a dependency that will trigger all of the deferred
            // run modules to run once all of the code has been loaded
            // for the page
            this.dependencies.push(readyDependency);
            this.requireContext.readyIncluded = true;
        }
    },
    addProcess: function(d) {
        if (this.requireContext.processIncluded === false) {
            this.dependencies.push(d);
            this.requireContext.processIncluded = true;
        }
    }
};

module.exports = Deduper;