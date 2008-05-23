function Model() {}

$.extend(Model, {
  constructors: {},
  repository: {},

  register: function(resource_url, constructor) {
    if (!constructor) {
      constructor = function() {};
    }
    constructor.prototype = new Model();
    constructor.prototype.constructor = constructor;
    Model.extend_constructor(resource_url, constructor);
    this.constructors[constructor.name] = constructor;
    this.repository[constructor.name] = {};
    return constructor;
  },

  merge: function(dataset) {
    var created = [];
    for(var name in dataset) {
      var constructor = this.constructors[name];
      if (!constructor) {
        throw "constructor '" + name + "' not registered with Model";
      }
      for(var id in dataset[name]) {
        if (!constructor.find(id)) {
          var attributes = dataset[name][id]
          attributes.id = id;
          var object = constructor.build(dataset[name][id]);
          this.repository[name][id] = object;
          created.push(object);
        }
      }
    }

    for(var i = 0; i < created.length; i++) {
      var object = created[i];
      object.constructor.trigger('create', [object]);
    }
  },

  subrepository: function(name) {
    if (!this.repository[name]) {
      this.repository[name] = {};
    }
    return this.repository[name];
  },

  extend_constructor: function(resource_url, constructor) {
    constructor.resource_url = resource_url;
    constructor.handlers = {};
    constructor.has_many_associations = [];
    $.extend(constructor, {
      has_many: function(association_name) {
        this.has_many_associations.push(association_name);
      },

      find: function(id) {
        return this.subrepository()[id]
      },

      all: function() {
        var all = [];
        $.each(this.subrepository(), function(id, object) {
          all.push(object);
        });
        return all;
      },

      each: function(f) {
        $.each(this.subrepository(), function(id, object) {
          f(object)
        });
      },

      find_all: function(conditions) {
        var found = [];
        this.each(function(object) {
          if (object.meets_conditions(conditions)) {
            found.push(object)
          }
        });
        return found;
      },

      subrepository: function() {
        return Model.subrepository(this.name);
      },

      build: function(attributes) {
        var object = new this(attributes);
        object.assign_attributes(attributes);
        this.attach_associations(object);
        return object;
      },

      create: function(attributes_or_callback) {
        if (attributes_or_callback instanceof Function) {
          this.bind('create', attributes_or_callback);
          return;
        }

        if (attributes_or_callback == null) {
          attributes_or_callback = {};
        }
        
        var self = this;
        $.ajax({
          url: this.resource_url,
          type: 'POST',
          data: this.to_controller_params(attributes_or_callback),
          success: function(response) {
            var json = JSON.parse(response);
            var object = self.build(json.created);
            self.subrepository()[object.id] = object;
            self.trigger('create', [object]);
          }
        });
      },

      fetch: function(params) {
        if (!params) params = {};
        var before_merge = params.before_merge;
        var after_merge = params.after_merge;
        var resource_url = params.resource_url || this.resource_url;

        $.ajax({
          url: resource_url,
          type: 'GET',
          success: function(result) {
            var json = JSON.parse(result);
            if (before_merge) before_merge();
            Model.merge(json);
            if (after_merge) after_merge();
          }
        });
      },

      to_controller_params: function(attributes) {
        var model_name = this.name.underscore();
        var params = {};
        for(var attr in attributes) {
          params[model_name + '[' + attr + ']'] = attributes[attr];
        }
        return params;
      },

      attach_associations: function(object) {
        for(var i = 0; i < this.has_many_associations.length; i++) {
          this.attach_association(object, this.has_many_associations[i]);
        }
      },

      attach_association: function(object, association_name) {
        var associated_constructor_name = association_name.singularize().camelize();
        var associated_constructor = Model.constructors[associated_constructor_name];
        if (!associated_constructor) {
          throw "No constructor " + associated_constructor_name + " found for association";
        }

        var foreign_key_name = this.name.underscore() + "_id";
        var conditions = {};
        conditions[foreign_key_name] = object.id;

        var association = function() {
          return associated_constructor.find_all(conditions);
        };

        association.each = function(f) {
          $.each(association.call(object), function(i, associated_object) {
            f(associated_object);
          })
        }

        object[association_name] = association;
      },

      after_create: function(handler) {
        this.bind('after_create', handler)
      },

      bind: function(event, handler) {
        if (!this.handlers[event]) {
          this.handlers[event] = []
        }
        this.handlers[event].push(handler);
      },

      trigger: function(event, args) {
        var handlers = this.handlers[event];
        if (handlers) {
          for(var i = 0; i < handlers.length; i++) {
            handlers[i].apply(this, args)
          }
        }
      }
    });
  }
});

$.extend(Model.prototype, {
  assign_attributes: function(attributes) {
    for(var attr in attributes) {
      this[attr] = attributes[attr];
    }
  },

  fetch: function(params) {
    if (!params) params = {};
    if (!params.resource_url) params.resource_url = this.resource_url();
    this.constructor.fetch(params);
  },

  resource_url: function() {
    return this.constructor.resource_url + "/" + this.id;
  },

  after_create: function() {},

  meets_conditions: function(conditions) {
    for(var attr in conditions) {
      if (this[attr] != conditions[attr]) return false;
    }
    return true;
  }
})