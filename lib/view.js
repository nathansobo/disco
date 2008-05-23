var View = function() {
  this.doc = [];
}

$.extend(View, {

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

$.extend(View.prototype, {
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

    var open_tag = new View.OpenTag(tag_name, attributes);
    this.doc.push(open_tag);

    if(typeof value == 'function') {
      value.call(this);
    } else if(typeof value == 'string') {
      this.doc.push(new View.Text(value));
    }

    this.doc.push(new View.CloseTag(tag_name));

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
    this.doc.push(new View.Text(value));
  },

  text: function(value) {
    var html = this.escape_html(value);
    this.doc.push(new View.Text(html));
  },

  escape_html: function(html) {
    return html.split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;")
  },

  subview: function(name, template) {
    this.doc.push(new View.OpenSubview(name))
    template.content(this);
    this.doc.push(new View.CloseSubview(template))
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

    this.doc.push(new View.Bind(type, data, fn));
  },

  click: function(fn) {
    this.doc.push(new View.Bind('click', null, fn));
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
    var post_processor = new View.PostProcessor($(this.to_string()));
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

View.initialize();

View.OpenTag = function(tag_name, attributes) {
  this.tag_name = tag_name;
  this.attributes = attributes;
}

$.extend(View.OpenTag.prototype, {
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

View.CloseTag = function(tag_name) {
  var that = this;
  this.tag_name = tag_name;
}

$.extend(View.CloseTag.prototype, {
  to_string: function() {
    return "</" + this.tag_name + ">";
  },

  post_process: function(processor) {
    processor.pop();
  }
});

View.Text = function(value) {
  this.value = value;
}

$.extend(View.Text.prototype, {
  to_string: function() {
    return this.value;
  },

  post_process: function(processor) {}
});

View.OpenSubview = function(name) {
  this.name = name;
}

$.extend(View.OpenSubview.prototype, {
  to_string: function() {
    return "";
  },

  post_process: function(processor) {
    processor.open_subview(this.name);
  }
});

View.CloseSubview = function(template) {
  this.template = template;
}

$.extend(View.CloseSubview.prototype, {
  to_string: function() {
    return "";
  },

  post_process: function(processor) {
    processor.close_view(this.template);
  }
});

View.Bind = function(type, data, fn) {
  this.type = type;
  this.data = data;
  this.fn = fn;
}

$.extend(View.Bind.prototype, {
  to_string: function() {
    return "";
  },

  post_process: function(processor) {
    processor.bind(this.type, this.data, this.fn);
  }
});

View.PostProcessor = function(root_view) {
  this.root_view = root_view;
  this.view_stack = [root_view];
  this.selector_stack = [];
}

$.extend(View.PostProcessor.prototype, {
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
    return this.root_view.find(this.next_selector());
  },

  previous_element: function() {
    if(this.selector_stack.length == 0) {
      return this.root_view;
    } else {
      return this.root_view.find(this.previous_selector())
    }
  },

  next_selector: function() {
    return this.selector(true)
  },

  previous_selector: function() {
    return this.selector(false)
  },

  selector: function(next) {
    var selectors = [];
    for(var i = 0; i < this.selector_stack.length; i++) {
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
