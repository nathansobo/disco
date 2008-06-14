var Disco = {};

Disco.Model = function() {};

$.extend(Disco.Model, {
  constructors: {},
  repository: {},

  register: function(resource_url, constructor) {
    if (!constructor) {
      constructor = function() {};
    }
    constructor.prototype = new Disco.Model();
    constructor.prototype.constructor = constructor;
    Disco.Model.extend_constructor(resource_url, constructor);
    constructor.name = constructor.toString().match(/function (\w+)/)[1];
    this.constructors[constructor.name] = constructor;
    this.repository[constructor.name] = {};
    return constructor;
  },

  merge: function(dataset) {
    var created = [];
    for(var name in dataset) {
      var constructor = this.constructors[name];
      if (!constructor) {
        throw "constructor '" + name + "' not registered with Disco.Model";
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
    constructor.has_many_through_associations = [];
    constructor.has_one_associations = [];
    constructor.belongs_to_associations = [];
    $.extend(constructor, {
      has_many: function(association_name, options) {
        this.has_many_associations.push($.extend(options, { association_name: association_name }));
      },

      has_many_through: function(association_name, through_association_name, options) {
        if (!options) options = {};
        this.has_many_through_associations.push($.extend(options, {
          association_name: association_name,
          through_association_name: through_association_name
        }));
      },

      has_one: function(association_name) {
        this.has_one_associations.push({ association_name: association_name });
      },

      belongs_to: function(association_name, options) {
        if (!options) options = {};
        this.belongs_to_associations.push($.extend(options, {
          association_name: association_name
        }));
      },

      find: function(id_or_conditions) {
        if (typeof(id_or_conditions) == 'number') {
          return this.subrepository()[id_or_conditions]
        } else {
          return this.find_all(id_or_conditions)[0];
        }
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

      find_all: function(conditions, options) {
        var found = [];
        this.each(function(object) {
          if (object.meets_conditions(conditions)) {
            found.push(object)
          }
        });
        if (options && options.order) {
          found.sort(function(a, b) {
            return a[options.order] < b[options.order] ? -1 : 1;
          });
        }
        found.collect = function(f) {
          return $.map(this, f);
        }
        return found;
      },

      subrepository: function() {
        return Disco.Model.subrepository(this.name);
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
            Disco.Model.merge(json);
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
          this.attach_has_many_association(object, this.has_many_associations[i]);
        }
        for(var i = 0; i < this.has_many_through_associations.length; i++) {
          this.attach_has_many_through_association(object, this.has_many_through_associations[i]);
        }
        for(var i = 0; i < this.has_one_associations.length; i++) {
          this.attach_has_one_association(object, this.has_one_associations[i]);
        }
        for(var i = 0; i < this.belongs_to_associations.length; i++) {
          this.attach_belongs_to_association(object, this.belongs_to_associations[i]);
        }
      },

      attach_has_many_association: function(object, association_info) {
        var association_name = association_info.association_name;
        var order = association_info.order;
        var associated_constructor = this.associated_constructor(association_info, true);
        var conditions = this.foreign_key_conditions(object);
        var options = {};
        if (order) options.order = order;
        var association = function() {
          return associated_constructor.find_all(conditions, options);
        };
        association.each = function(f) {
          $.each(association.call(object), function(i, associated_object) {
            f(associated_object);
          })
        };
        object[association_name] = association;
      },

      attach_has_many_through_association: function(object, association_info) {
        var association_name = association_info.association_name;
        var through_association_name = association_info.through_association_name;
        var source = association_info.source || association_name.singularize();
        object[association_name] = function() {
          return this[through_association_name]().collect(function(join_model) {
            return join_model[source]();
          });
        }
      },

      attach_has_one_association: function(object, association_info) {
        var association_name = association_info.association_name;
        var associated_constructor = this.associated_constructor(association_info, false);
        var conditions = this.foreign_key_conditions(object);
        object[association_name] = function() {
          return associated_constructor.find(conditions);
        };
      },

      attach_belongs_to_association: function(object, association_info) {
        var association_name = association_info.association_name;

        var associated_constructor = this.associated_constructor(association_info, false);
        var foreign_key = association_name + "_id";
        object[association_name] = function() {
          return associated_constructor.find(this[foreign_key]);
        };
      },

      foreign_key_conditions: function(object) {
        var foreign_key_name = this.name.underscore() + "_id";
        var conditions = {};
        conditions[foreign_key_name] = object.id;
        return conditions;
      },

      associated_constructor: function(association_info, name_is_plural) {
        if (association_info.constructor_name) {
          var constructor_name = association_info.constructor_name;
        } else {
          var association_name = association_info.association_name;
          if (name_is_plural) {
            var constructor_name = association_name.singularize().camelize();
          } else {
            var constructor_name = association_name.camelize();
          }
        }
        var associated_constructor = Disco.Model.constructors[constructor_name];
        if (!associated_constructor) {
          throw "No constructor " + constructor_name + " found for association";
        }
        return associated_constructor;
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

$.extend(Disco.Model.prototype, {
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

Disco.View = function() {
  this.doc = [];
};

$.extend(Disco.View, {
  build: function(fn_or_template) {
    var builder = new this();
    if (fn_or_template instanceof Function) {
      fn_or_template(builder)
      return builder.to_view();
    } else {
      fn_or_template.content(builder);
      var view = builder.to_view(fn_or_template);
      return view;
    }
  },

  initialize: function() {
    var supportedTags = [
      'a', 'acronym', 'address', 'area', 'b', 'base', 'bdo', 'big', 'blockquote', 'body',
      'br', 'button', 'caption', 'cite', 'code', 'dd', 'del', 'div', 'dl', 'dt', 'em',
      'fieldset', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'hr', 'html', 'i',
      'img', 'iframe', 'input', 'ins', 'kbd', 'label', 'legend', 'li', 'link', 'map',
      'meta', 'noframes', 'noscript', 'ol', 'optgroup', 'option', 'p', 'param', 'pre',
      'samp', 'script', 'select', 'small', 'span', 'strong', 'style', 'sub', 'sup',
      'table', 'tbody', 'td', 'textarea', 'th', 'thead', 'title', 'tr', 'tt', 'ul', 'var'
    ];

    for(var i=0; i < supportedTags.length; i++) {
      var tag = supportedTags[i];
      this.register_tag(tag);
    }
  },

  register_tag: function(tag_name) {
    this.prototype[tag_name] = function() {
      return this.tag_with_array_args(tag_name, arguments);
    };
  }
});

$.extend(Disco.View.prototype, {
  tag: function() {
    if(arguments.length > 3) {
      throw("XmlBulider#tag does not accept more than three arguments");
    }
    var tag_name, attributes, value;
    tag_name = arguments[0];

    var arg1 = arguments[1];
    if(typeof arg1 == 'object') {
      attributes = arg1;
      var arg2 = arguments[2];
      if(typeof arg2 == 'function' || typeof arg2 == 'string'){
        value = arg2;
      };
    } else if(typeof arg1 == 'function' || typeof arg1 == 'string'){
      value = arg1;
      var arg2 = arguments[2];
      if(typeof arg2 == 'object') {
        attributes = arg2;
      }
    };

    var open_tag = new Disco.View.OpenTag(tag_name, attributes);
    this.doc.push(open_tag);

    if(typeof value == 'function') {
      value.call(this);
    } else if(typeof value == 'string') {
      this.doc.push(new Disco.View.Text(value));
    }

    this.doc.push(new Disco.View.CloseTag(tag_name));

    return this;
  },

  tag_with_array_args: function(tag, args) {
    if(!args) return this.tag(tag);

    var new_arguments = [tag];
    for(var i=0; i < args.length; i++) {
      new_arguments.push(args[i]);
    }
    return this.tag.apply(this, new_arguments);
  },

  rawtext: function(value) {
    this.doc.push(new Disco.View.Text(value));
  },

  text: function(value) {
    var html = this.escape_html(value);
    this.doc.push(new Disco.View.Text(html));
  },

  escape_html: function(html) {
    return html.split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;")
  },

  subview: function(name, template) {
    this.doc.push(new Disco.View.OpenSubview(name))
    template.content(this);
    this.doc.push(new Disco.View.CloseSubview(template))
  },

  bind: function() {
    var type = arguments[0];
    if (arguments.length > 2) {
      var data = arguments[1];
      var fn = arguments[2];
    } else {
      var data = null;
      var fn = arguments[1];
    }

    this.doc.push(new Disco.View.Bind(type, data, fn));
  },

  click: function(fn) {
    this.doc.push(new Disco.View.Bind('click', null, fn));
  },

  to_string: function() {
    var output = "";
    for(var i=0; i < this.doc.length; i++) {
      var element = this.doc[i];
      output += element.to_string();
    }
    return output;
  },

  to_view: function(template) {
    var string = this.to_string();
    if (string == "") return "";


    var post_processor = new Disco.View.PostProcessor($(string));
    for(var i=0; i < this.doc.length; i++) {
      var element = this.doc[i];
      element.post_process(post_processor);
    }
    if (template) {
      post_processor.close_view(template)
    }
    return post_processor.root_view;
  }
});

Disco.View.initialize();

Disco.View.OpenTag = function(tag_name, attributes) {
  this.tag_name = tag_name;
  this.attributes = attributes;
}

$.extend(Disco.View.OpenTag.prototype, {
  to_string: function() {
    var serialized_attributes = [];
    for(var attributeName in this.attributes) {
      serialized_attributes.push(attributeName + '="' + this.attributes[attributeName] + '"');
    }
    if(serialized_attributes.length > 0) {
      return "<" + this.tag_name + " " + serialized_attributes.join(" ") + ">";
    } else {
      return "<" + this.tag_name + ">";
    }
  },

  post_process: function(processor) {
    processor.push();
  }
});

Disco.View.CloseTag = function(tag_name) {
  var that = this;
  this.tag_name = tag_name;
}

$.extend(Disco.View.CloseTag.prototype, {
  to_string: function() {
    return "</" + this.tag_name + ">";
  },

  post_process: function(processor) {
    processor.pop();
  }
});

Disco.View.Text = function(value) {
  this.value = value;
}

$.extend(Disco.View.Text.prototype, {
  to_string: function() {
    return this.value;
  },

  post_process: function(processor) {}
});

Disco.View.OpenSubview = function(name) {
  this.name = name;
}

$.extend(Disco.View.OpenSubview.prototype, {
  to_string: function() {
    return "";
  },

  post_process: function(processor) {
    processor.open_subview(this.name);
  }
});

Disco.View.CloseSubview = function(template) {
  this.template = template;
}

$.extend(Disco.View.CloseSubview.prototype, {
  to_string: function() {
    return "";
  },

  post_process: function(processor) {
    processor.close_view(this.template);
  }
});

Disco.View.Bind = function(type, data, fn) {
  this.type = type;
  this.data = data;
  this.fn = fn;
}

$.extend(Disco.View.Bind.prototype, {
  to_string: function() {
    return "";
  },

  post_process: function(processor) {
    processor.bind(this.type, this.data, this.fn);
  }
});

Disco.View.PostProcessor = function(root_view) {
  this.root_view = root_view;
  this.view_stack = [root_view];
  this.selector_stack = [0];
}

$.extend(Disco.View.PostProcessor.prototype, {
  push: function() {
    this.add_child();
    this.selector_stack.push(0);
  },

  add_child: function() {
    if (!this.selector_stack.length == 0) {
      this.selector_stack[this.selector_stack.length - 1]++;
    }
  },

  pop: function() {
    this.selector_stack.pop();
  },

  open_subview: function(name) {
    var view = this.next_element();
    this.current_view()[name] = view;
    this.view_stack.push(view);
  },

  close_view: function(template) {
    var current_view = this.current_view();
    if (template.methods) {
      $.extend(current_view, template.methods);
    }
    if (current_view.after_initialize) {
      current_view.after_initialize();
    }
    this.view_stack.pop();
  },

  bind: function(type, data, fn) {
    var view = this.current_view();
    this.previous_element().bind(type, data, function(event) {
      fn(event, view);
    });
  },

  next_element: function() {
    return this.find_element(this.next_selector());
  },

  previous_element: function() {
    if(this.selector_stack.length == 1) {
      if (this.root_view.length == 1) {
        return this.root_view;
      } else {
        return this.root_view.eq(this.num_root_children() - 1);
      }
    } else {
      return this.find_element(this.previous_selector());
    }
  },

  find_element: function(selector) {
    if(this.root_view.length == 1) {
      return this.root_view.find(selector);
    } else {
      return this.root_view.eq(this.num_root_children() - 1).find(selector);
    }
  },

  num_root_children: function() {
    return this.selector_stack[0];
  },

  next_selector: function() {
    return this.selector(true)
  },

  previous_selector: function() {
    return this.selector(false)
  },

  selector: function(next) {
    var selectors = [];
    for(var i = 1; i < this.selector_stack.length; i++) {
      if (i == this.selector_stack.length - 1) {
        var index = next ? this.selector_stack[i] + 1 : this.selector_stack[i];
        selectors.push(":nth-child(" + index + ")")
      } else {
        selectors.push(":nth-child(" + this.selector_stack[i] + ")")
      }
    }
    return "> " + selectors.join(" > ");
  },

  current_view: function() {
    return this.view_stack[this.view_stack.length - 1];
  }
});
