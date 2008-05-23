require("/specs/spec_helper");

Screw.Unit(function() {
  describe("View", function() {
    var builder;
    before(function() {
      $('#screw_unit_content').html("");
      builder = new View();
    });

    describe("#tag", function() {
      it("returns the builder", function() {
        expect(builder.tag("div")).to(equal, builder);
      });
      
      it("with no arguments, generates an open and close tag", function() {
        builder.tag("div");
        expect(builder.to_string()).to(equal, "<div></div>");
      });

      it("with no attributes, generates an open and close tag with those attributes", function() {
        builder.tag("div", {'class': "foo"});
        expect(builder.to_string()).to(equal, '<div class="foo"></div>');
      });

      it("with a functional argument, wraps the tag around whatever the functional argument builds", function() {
        builder.tag("div", function() {
          builder.tag("span");
        });
        expect(builder.to_string()).to(equal, '<div><span></span></div>');
      });

      it("with attributes and a functional argument, wraps the tag with the given attributes around whatever the functional argument builds", function() {
        builder.tag("div", {'class': "bar"}, function() {
          builder.tag("span");
        });
        expect(builder.to_string()).to(match, '<div class="bar"><span></span></div>');
      });

      it("with a textual argument, wraps the tag around the text", function() {
        builder.tag("div", "some text");
        expect(builder.to_string()).to(match, '<div>some text</div>');
      });

      it("with attributes and a textual argument, wraps the tag with the given attributes around the text", function() {
        builder.tag("div", "some text", {'class': "baz"});
        expect(builder.to_string()).to(match, '<div class="baz">some text</div>');
      });
    });

    describe("#text", function() {
      it("renders the HTML-escaped version of the given text", function() {
        builder.tag('span', function() {
          builder.text("Me & You");
        })
        expect(builder.to_string()).to(match, '<span>Me &amp; You</span>');
      });
    });

    describe("#rawtext", function() {
      it("renders the given text unescaped", function() {
        builder.tag('span', function() {
          builder.rawtext("Me & You");
        })
        expect(builder.to_string()).to(match, '<span>Me & You</span>');
      });
    });

    describe("to_view", function() {
      it("returns a jQuery wrapped version of the generated XML", function() {
        with(builder) {
          div({'class': "foo"}, function() {
            span({'class': "bar"});
          });
        }

        var view = builder.to_view();
        expect(view).to(match_selector, 'div.foo');
        expect(view).to(contain_selector, 'span.bar');
      });
    });

    describe(".build", function() {
      it("when passed a function, calls the function with a builder and returns a view", function() {
        var view = View.build(function(builder) {
          with(builder) {
            div({'class': "foo"}, function() {
              div({'class': "bar"});
            });
          }
        });

        expect(view).to(match_selector, 'div.foo');
        expect(view).to(contain_selector, 'div.bar');
      });

      describe("when passed a template", function() {
        var view;
        var template = {
          content: function(builder) {
            with(builder) {
              div({'class': "foo"}, function() {
                div({'class': "bar"});
              });
            }
          },

          methods: {
            foo: function() {
              return "bar";
            },

            after_initialize: function() {
              this.after_initialize_called = true;
            }
          }
        }

        before(function() {
          view = View.build(template);
        });

        it("returns a view wrapping the HTML specified in the template's content method", function() {
          expect(view).to(match_selector, 'div.foo');
          expect(view).to(contain_selector, 'div.bar');
        });

        it("attaches the template's methods to the returned view", function() {
          expect(view.foo()).to(equal, "bar");
        });

        it("calls after_initialize on the created view if the method exists", function() {
          expect(view.after_initialize_called).to(be_true);
        });
      });
    });

    describe("#subview", function() {
      var view;
      var initialization_order;

      var template_1 = {
        content: function(builder) {
          with(builder) {
            div({'class': "bar"}, function() {
              subview('subview', template_2)
            });
          }
        },

        methods: {
          foo: function() {
            return "bar"
          },

          after_initialize: function() {
            initialization_order.push(this);
          }
        }
      }

      var template_2 = {
        content: function(builder) {
          builder.span({'class': "baz"});
        },

        methods: {
          baz: function() {
            return "bop"
          },

          after_initialize: function() {
            initialization_order.push(this);
          }
        }
      }

      before(function() {
        initialization_order = [];
        view = View.build(function(builder) {
          with(builder) {
            div({'class': "foo"}, function() {
              subview('subview', template_1);
            });
          }
        });
      });

      it("causes a jQuery wrapped version of the content of the given template to be assigned to the given name on the parent view", function() {
        expect(view.subview).to(match_selector, 'div.foo > div.bar');
        expect(view.subview.subview).to(match_selector, 'div.foo > div.bar > span.baz');
      });

      it("attaches the methods specified in each subview template to the constructed view object", function() {
        expect(view.subview.foo()).to(equal, "bar");
        expect(view.subview.subview.baz()).to(equal, "bop");
      });

      it("calls after initialize on each view object if it exists, starting with the lowest subview first", function() {
        expect(initialization_order).to(equal, [view.subview.subview, view.subview]);
      });
    });

    describe("#bind", function() {
      it("causes a jQuery #bind on the preceding element of a closure which calls the given function with the current view object", function() {
        var callback_data;
        var callback_view;

        var data = {foo: "bar"};

        var subview_template = {
          content: function(builder) {
            builder.div({'class': "bar"}).bind('click', data, function(event, view) {
              callback_data = event.data;
              callback_view = view;
            });
          }
        }

        with(builder) {
          div({'class': "foo"}, function() {
            subview('subview', subview_template);
          });
        }

        var view = builder.to_view();

        view.find("div.bar").trigger('click');
        expect(callback_data).to(equal, data);
        expect(callback_view).to(equal, view.subview);

      });

      it("works when no data is provided", function() {
        var callback_view;
        with(builder) {
          div({'class': "foo"}, function() {
            div({'class': "bar"}).bind("click", function(event, view) {
              callback_view = view;
            })
          })
        }

        var view = builder.to_view();
        view.find('div.bar').trigger('click');
        expect(callback_view).to(equal, view);
      });

      it("works on the root_view", function() {
        var callback_view;
        builder.div({'class': "foo"}).bind("click", function(event, view) {
          callback_view = view;
        });

        var view = builder.to_view();
        view.trigger('click');
        expect(callback_view).to(equal, view);
      });
    });
    
    describe("#click", function() {
      it("calls bind with the 'click' type and a closure that captures the current view", function() {
        var view_argument;

        with(builder) {
          div({'class': "foo"}, function() {
            div({'class': "bar"}).click(function(event, view) {
              view_argument = view;
            })
          });
        }

        var view = builder.to_view();
        view.find('div.bar').click();
        expect(view_argument).to(equal, view);
      });
    });
  });
});