function RequireContext() {
    this.addedDefDependencies = {};
    this.addedRunDependencies = {};
    this.addedDepDependencies = {};
    this.addedMainDependencies = {};
    this.addedRemapDependencies = {};
    this.addedRequireDependencies = {};
    this.clientIncluded = false;
    this.readyIncluded = false;
    this.processIncluded = false;
}

RequireContext.prototype = {
};

module.exports = RequireContext;