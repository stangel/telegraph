var Telegraph = function (opts) {
  this.initialize = function(opts) {
    this.server      = opts.server;
    this.queriesPath = opts.queriesPath || 'queries';
    this.renderPath  = opts.renderPath  || 'render';
    this.addPath     = opts.addPath     || 'add-query';
    this.testPath    = opts.testPath    || 'test-query';
    this.removePath  = opts.removePath  || 'remove-query';
    this.schemaPath  = opts.schemaPath  || 'schema';
  }
  this.initialize(opts);
};

Telegraph.prototype.renderUrl = function(targets) {
  var targetParams = _.map(targets, function(t) {
    return "target=" + t.query
  }).join('&');
  return "http://" + this.server + "/" + this.renderPath + "?" + targetParams;
};

Telegraph.prototype.getData = function(targets, opts) {
  var self = this;
  var data;
  $.ajax({
    url: this.renderUrl(targets),
    data: {
      from:  opts.from,
      until: opts.until
    },
    async: false,
    success: function(d) {
      data = self.toD3Friendly(targets, d);
    }
  });
  return data;
};

Telegraph.prototype.getQueries = function() {
  var self = this;
  var tree = {name: 'Queries', values: []};

  $.ajax({
    url: "http://" + this.server + "/" + this.queriesPath,
    async: false,
    success: function(queries) {
      _.each(queries, function(opts) {
        var path = self.path(opts);
        tree = self.updateIn(tree, path, self.nodeWriter(opts));
      });
    }
  });

  return tree;
};

Telegraph.prototype.getSchema = function() {
  var schema;
  $.ajax({
    url: "http://" + this.server + "/" + this.schemaPath,
    async: false,
    success: function(data) {
      schema = data;
    }
  });
  return schema;
}

Telegraph.prototype.addOpts = function(field, selector) {
  var schema = this.getSchema();
  var select = $(selector);
  _.each(schema[field], function(opt, index) {
    select.append('<option value=' + opt + '>' + opt + '</option>');
  });
};

Telegraph.prototype.addTree = function(selector) {
  var self = this;

  this.treeSelector = selector;
  this.queries = this.getQueries();
  this.queryTree = nv.models.indentedTree().tableClass('table table-striped') //for bootstrap styling
  this.queryTree.columns([
    { key: 'name',
      label: 'Name',
      type: 'text',
      showCount: true,
      classes: function(d) {
        console.log(d);
      },
      width: '40%' },
    { key: 'query',
      label: 'Query',
      type: 'text',
      width: '50%' },
    { key: 'view',
      label: '',
      classes: 'clickable',
      click: function(d) {
        self.viewQuery(d.opts);
      },
      type: 'text',
      width: '5%' },
    { key: 'remove',
      label: '',
      classes: 'clickable',
      click: function (d) {
        self.removeQuery(d.opts);
      },
      type: 'text',
      width: '5%' }
  ])

  nv.addGraph(function() {
    d3.select(selector)
      .datum([self.queries])
      .call(self.queryTree);
    return self.queryTree;
  });
};

Telegraph.prototype.addQuery = function(opts, success) {
  var self  = this;
  var query = opts.query;
  var name  = opts.name;
  var path  = this.path(opts);

  $.ajax({
    url: "http://" + this.server + "/" + this.addPath,
    type: "POST",
    data: opts,
    async: true,
    success: function(d) {
      self.queries = self.updateIn(self.queries, path, self.nodeWriter(opts));
      self.queryTree.update();
      if (success) success(d);
    },
    dataType: "text"
  });
};

Telegraph.prototype.testQuery = function(opts, progress, done) {
  var xhr = new XMLHttpRequest();
  var params = _.map(opts, function(v,k) {return k + "=" + v}).join("&");
  var url = "http://" + this.server + "/" + this.testPath + "?" + params;

  xhr.onreadystatechange = function() {
    if (xhr.responseText.length > 0) progress(xhr.responseText);
    if (xhr.readyState == XMLHttpRequest.DONE && done) {
      done();
    };
  }

  xhr.open('GET', encodeURI(url), true);
  xhr.send(null);

  return xhr;
};

Telegraph.prototype.removeQuery = function(opts, success) {
  var self = this;
  var path = self.path(opts);

  $.ajax({
    url: "http://" + this.server + "/" + this.removePath,
    type: "POST",
    data: opts,
    async: true,
    success: function(d){
      var node = self.getIn(self.queries, path);

      if (self.isLeaf(node)) {
        self.queries = self.dissocIn(self.queries, path);
      } else {
        self.queries = self.updateIn(self.queries, path, self.nodeWriter());
      }
      self.queryTree.update();
      if (success) success(d);
    },
    dataType: "text"
  });
};

// Helper functions //

Telegraph.prototype.toD3Friendly = function(targets, rawData) {
  var data = [];
  _.each(rawData, function(obj, idx){
    var dps = _.map(obj.datapoints, function(obj){ return { x: obj[1] || 0, y: obj[0] || 0 } });
    var d = { key: targets[idx].name || obj.target, values: dps };
    data.push(d);
  });
  return data;
};

Telegraph.prototype.path = function(opts) {
  var path = opts.name.split(/[\.:]/);
  if (opts.type) path.unshift(opts.type);
  return path;
};

Telegraph.prototype.values = function(node) {
  if (node) {
    return node.values || node._values || [];
  } else {
    return [];
  }
};

Telegraph.prototype.isLeaf = function(node) {
  return this.values(node).length == 0;
};

Telegraph.prototype.assocValues = function(node, values) {
  var valuesKey = (node && node.values) ? 'values' : '_values'
  return _.extend(node || {}, _.object([[valuesKey, values]]));
};

Telegraph.prototype.get = function(tree, name) {
  return _.find(this.values(tree), function(v) { return v.name == name});
};

Telegraph.prototype.assoc = function(tree, name, obj) {
  var values = _.reject(this.values(tree), function(v) { return v.name == name});
  values = values.concat([_.extend(obj || {}, {name: name})]);
  return this.assocValues(tree, values);
};

Telegraph.prototype.dissoc = function(tree, name) {
  var values = _.reject(this.values(tree), function(v) { return v.name == name});
  return this.assocValues(tree, values);
};

Telegraph.prototype.nodeWriter = function(opts) {
  opts = opts || {};
  var query = opts.query;
  return function(obj) {
    return _.extend(obj || {}, {
      opts:   opts,
      query:  query,
      view:   query ? 'view'   : null,
      remove: query ? 'remove' : null
    });
  };
};

Telegraph.prototype.getIn = function(tree, path) {
  if (path.length == 0) {
    return tree;
  } else {
    return this.getIn(this.get(tree, _.first(path)), _.rest(path));
  }
}

Telegraph.prototype.assocIn = function(tree, path, obj) {
  if (path.length == 0) {
    return obj;
  } else {
    var key = _.first(path);
    var subtree = this.assocIn(this.get(tree, key), _.rest(path), obj);
    return this.assoc(tree, key, subtree);
  }
};

Telegraph.prototype.dissocIn = function(tree, path) {
  if (path.length == 0) {
    return {};
  } else {
    var key = _.first(path);
    var subtree = this.dissocIn(this.get(tree, key), _.rest(path));
    if (this.isLeaf(subtree) && !subtree.query) {
      return this.dissoc(tree, key);
    } else {
      return this.assoc(tree, key, subtree);
    }
  }
};

Telegraph.prototype.updateIn = function(tree, path, f) {
  return this.assocIn(tree, path, f(this.getIn(tree, path) || null));
};
