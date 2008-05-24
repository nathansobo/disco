require("/specs/spec_helper");

Screw.Unit(function() {
  describe("Disco.Model", function() {
    describe(".register", function() {
      describe("when passed a collection resource's url", function() {
        var constructor;

        before(function() {
          constructor = Disco.Model.register('/widgets');
        });

        it("creates a whose prototype is an instance of Disco.Model", function() {
          expect(constructor.prototype instanceof Disco.Model).to(equal, true);
        });

        it("creates a constructor with the given resource url", function() {
          expect(constructor.resource_url).to(equal, '/widgets');
        });
      });

      describe("when passed a collection resource's url and a constructor function", function() {
        var f;
        var constructor;

        before(function() {
          f = function() {};
          constructor = Disco.Model.register('/widgets', f);
        });

        it("sets the given constructor function's prototype to an instance of model and returns it", function() {
          expect(constructor).to(equal, f);
          expect(constructor.prototype instanceof Disco.Model).to(equal, true);
        });

        it("sets the constructor's resource url to the given url", function() {
          expect(constructor.resource_url).to(equal, '/widgets');
        });
      });

    });

    describe(".merge", function() {
      var dataset;

      before(function() {
        Widget = function Widget() {};
        Disco.Model.register('/widgets', Widget);

        Gadget = function Gadget() {};
        Disco.Model.register('/gadgets', Gadget);

        Disco.Model.repository = {
          Widget: {
            1: Widget.build({
              'maker': "China",
              'part_number': 5
            })
          },

          Gadget: {
            1: Gadget.build({
              'size': "big",
              'use': "dancing"
            })
          }
        }

        dataset = {
          'Widget': {
            1: {
              'maker': "China",
              'part_number': 5
            },

            99: {
              'maker': "Germany",
              'part_number': 34
            }
          },

          'Gadget': {
            1: {
              'size': "big",
              'use': "none"
            },

            101: {
              'size': "small",
              'use': "cutting"
            }
          }
        };
      });

      after(function() {
        delete Widget;
        delete Gadget;
        Disco.Model.repository = {};
      });

      it("creates objects that don't yet exist in the given dataset", function() {
        expect(Widget.find(99)).to(be_null);
        expect(Gadget.find(101)).to(be_null);

        Disco.Model.merge(dataset);

        var widget_99 = Widget.find(99);
        expect(widget_99.id).to(equal, 99);
        expect(widget_99.maker).to(equal, "Germany");
        expect(widget_99.part_number).to(equal, 34);

        var gadget_101 = Gadget.find(101);
        expect(gadget_101.id).to(equal, 101);
        expect(gadget_101.size).to(equal, "small");
        expect(gadget_101.use).to(equal, "cutting");
      });

      it("triggers the 'create' callback on the appropriate constructors after all objects have been inserted", function() {
        var widget_99, gadget_101;

        Widget.create(function(widget) {
          gadget_101 = Gadget.find(101);
        });
        Gadget.create(function(gadget) {
          widget_99 = Widget.find(99);
        })

        Disco.Model.merge(dataset);

        expect(widget_99).to(equal, Widget.find(99))
        expect(gadget_101).to(equal, Gadget.find(101))
      });

      it("throws an exception if a model's constructor is not registered", function() {
        try {
          Disco.Model.merge({
            Bogus: {
              1: {
                name: "Bill OReilly"
              }
            }
          });
        } catch(message) {
          expect(message).to(equal, "constructor 'Bogus' not registered with Disco.Model");
        }
      });
    });
  });

  describe("A registered Disco.Model constructor", function() {
    var all_widgets, all_gadgets;

    before(function() {
      Widget = function Widget() {};
      Disco.Model.register('/widgets', Widget);
      Widget.has_many('gadgets');

      Gadget = function Gadget() {};
      Disco.Model.register('/gadgets', Gadget);

      Disco.Model.repository = {
        Widget: {
          1: Widget.build({
            id: 1,
            maker: 'Mattel',
            part_number: 4
          }),

          99: Widget.build({
            id: 1,
            maker: 'Apple',
            part_number: 42
          })
        },

        Gadget: {
          2: Gadget.build({
            id: 1,
            use: 'sunbathing',
            price: 20,
            widget_id: 1
          }),

          33: Gadget.build({
            id: 1,
            use: 'peace',
            price: 20,
            widget_id: 1
          }),

          44: Gadget.build({
            id: 1,
            use: 'peace',
            price: 20,
            widget_id: 2
          })
        }
      };

      all_widgets = [];
      for (var id in Disco.Model.repository.Widget) {
        all_widgets.push(Disco.Model.repository.Widget[id]);
      }

      all_gadgets = [];
      for (var id in Disco.Model.repository.Gadget) {
        all_gadgets.push(Disco.Model.repository.Gadget[id]);
      }
    });

    after(function() {
      delete Widget;
      delete Gadget;

      Disco.Model.repository = {};
    });


    describe("a has_many association", function() {
      before(function() {
        expect(Gadget.find_all({widget_id: 1})).to_not(be_empty);
      });

      it("returns an array of the associated objects", function() {
        expect(Widget.find(1).gadgets()).to(equal, Gadget.find_all({widget_id: 1}));
      });

      describe(".each", function() {
        it("iterates over the items returned by the association", function() {
          var eached = [];
          Widget.find(1).gadgets.each(function(gadget) {
            eached.push(gadget);
          })
          expect(eached).to(equal, Gadget.find_all({widget_id: 1}));
        });
      });
    });

    describe(".find", function() {
      it("finds an object for the constructor in the repository by the given id", function() {
        expect(Widget.find(1)).to(equal, Disco.Model.repository.Widget[1])
        expect(Widget.find(99)).to(equal, Disco.Model.repository.Widget[99])
        expect(Gadget.find(2)).to(equal, Disco.Model.repository.Gadget[2])
        expect(Gadget.find(33)).to(equal, Disco.Model.repository.Gadget[33])
      });
    });

    describe(".find_all", function() {
      it("returns all objects matching the passed in conditions hash", function() {
        var expected_objects = [];
        Gadget.each(function(gadget) {
          if (gadget.price == 20 && gadget.use == 'peace') {
            expected_objects.push(gadget);
          }
        });
        expect(expected_objects.length > 1).to(be_true);

        expect(Gadget.find_all({price: 20, use: 'peace'})).to(equal, expected_objects);
      });
    });

    describe(".create", function() {
      it("when called with a function, binds the create callback on the constructor", function() {
        var callback_arg;
        Widget.create(function(arg) {
          callback_arg = arg;
        });
        Widget.trigger('create', ["foo"]);
        expect(callback_arg).to(equal, "foo");
      });

      it("when called without arguments, sends a create request to the constructor's resource url", function() {
        expect($.ajax_requests).to(be_empty);
        Widget.create();
        expect($.ajax_requests).to(have_length, 1);
        var request = $.ajax_requests.shift()
        expect(request.url).to(equal, '/widgets');
        expect(request.type).to(equal, 'POST');
      });

      it("when called with attributes, sends a create request to the constructor's resource url", function() {
        expect($.ajax_requests).to(be_empty);
        Widget.create({ foo: 'bar', baz: 'bop'});
        expect($.ajax_requests).to(have_length, 1);
        var request = $.ajax_requests.shift()
        expect(request.url).to(equal, '/widgets');
        expect(request.type).to(equal, 'POST');
        expect(request.data).to(equal, {
          'widget[foo]': 'bar',
          'widget[baz]': 'bop'
        });
      });

      describe("after a successful response to an ajax request", function() {
        var created_attributes;
        var callback_arg

        before(function() {
          Widget.create(function(widget) {
            callback_arg = widget;
          })

          Widget.create({ foo: 'bar', baz: 'bop'})
          var request = $.ajax_requests.shift()

          created_attributes = {
            id: 1,
            foo: 'bar',
            baz: 'bang'
          }

          request.success(JSON.stringify({
            created: created_attributes
          }));
        });

        it("adds an object with the response's 'created' attributes to the repository", function() {
          var widget = Widget.find(created_attributes.id);
          expect(widget.foo).to(equal, created_attributes.foo);
          expect(widget.baz).to(equal, created_attributes.baz);
        });

        it("triggers the 'create' callback on the constructor", function() {
          expect(callback_arg).to(equal, Widget.find(created_attributes.id));
        });
      });
    });

    describe(".fetch", function() {
      before(function() {
        Disco.Model.use_real_fetch();
      });

      after(function() {
        Disco.Model.use_fake_fetch();
      });

      it("sends a GET request to the .resource_url and merges the resulting dataset", function() {
        expect($.ajax_requests).to(be_empty);
        Widget.fetch()
        expect($.ajax_requests).to(have_length, 1);
        var request = $.ajax_requests.shift();

        expect(request.url).to(equal, Widget.resource_url);
        expect(request.type).to(equal, 'GET');

        expect(Widget.find(2)).to(be_null);
        expect(Gadget.find(4)).to(be_null);

        request.success(JSON.stringify({
          'Widget': {
            2: {
              'maker': "Gilette",
              'part_number': 45
            }
          },

          'Gadget': {
            4: {
              'use': "jumping",
              'price': 400
            }
          }
        }));

        expect(Widget.find(2)).to_not(be_null);
        expect(Gadget.find(4)).to_not(be_null);
      });

      it("calls the before_merge and after_merge callbacks before and after the merge if they are provided", function() {
        var before_merge, after_merge;

        expect(Widget.find(2)).to(be_null);
        Widget.fetch({
          before_merge: function() {
            before_merge = Widget.find(2);
          },

          after_merge: function() {
            after_merge = Widget.find(2);
          }
        });

        $.ajax_requests.shift().success(JSON.stringify({
          'Widget': {
            2: {
              'maker': "Death Inc.",
              'part_number': 23
            }
          }
        }));

        expect(before_merge).to(be_null);
        expect(after_merge).to(equal, Widget.find(2));
      });
    });

    describe(".all", function() {
      it("returns an array of all instances of the constructor in the repository", function() {
        expect(Widget.all()).to(equal, all_widgets);
      });
    });
    
    describe(".each", function() {
      it("executes the given function on every instance of the constructor in the repository", function() {
        var eached = [];
        Widget.each(function(widget) {
          eached.push(widget)
        })
        expect(eached).to(equal, all_widgets);
      });
    });

    describe(".bind and .trigger", function() {
      it("attaches and triggers callbacks on the constructor with the given arguments", function() {
        var object_1;
        var object_2;
        var argument_1;
        var argument_2;
        Widget.bind('foo', function(arg) {
          object_1 = this;
          argument_1 = arg;
        });

        Widget.bind('foo', function(arg) {
          object_2 = this;
          argument_2 = arg;
        });

        var arg = new Object();
        Widget.trigger('foo', [arg]);

        expect(object_1).to(equal, Widget);
        expect(object_2).to(equal, Widget);
        expect(argument_1).to(equal, arg);
        expect(argument_2).to(equal, arg);
      });
    });
    
    describe("#fetch", function() {
      it("sends a get request to the instance's resource url and merges the resulting dataset", function() {
        var widget = Widget.find(1);

        expect($.ajax_requests).to(be_empty);

        widget.fetch();

        expect($.ajax_requests).to(have_length, 1);
        var request = $.ajax_requests.shift();
        expect(request.url).to(equal, "/widgets/1");
        expect(request.type).to(equal, "GET");

        expect(Gadget.find(3)).to(be_null);
        expect(Gadget.find(4)).to(be_null);

        request.success(JSON.stringify({
          'Gadget': {
            3: {
              'use': "coffee",
              'price': 300
            },

            4: {
              'use': "cigarettes",
              'price': 3
            }
          }
        }));

        expect(Gadget.find(3)).to_not(be_null);
        expect(Gadget.find(4)).to_not(be_null);
      });

      it("calls the before_merge and after_merge callbacks before and after the merge if they are provided", function() {
        var before_merge, after_merge;
        var widget = Widget.find(1);

        expect(Gadget.find(3)).to(be_null);

        widget.fetch({
          before_merge: function() {
            before_merge = Gadget.find(3);
          },

          after_merge: function() {
            after_merge = Gadget.find(3);
          }
        });

        $.ajax_requests.shift().success(JSON.stringify({
          'Gadget': {
            3: {
              'use': "coffee",
              'price': 300
            }
          }
        }));

        expect(before_merge).to(be_null);
        expect(after_merge).to(equal, Gadget.find(3));
      });
    });
    
    describe("#resource_url", function() {
      it("returns the object's id appended to its constructor's resource url", function() {
        var widget = Widget.find(1);
        expect(widget.resource_url()).to(equal, "/widgets/1");
      });
    });

    describe("#meets_conditions", function() {
      var gadget;
      before(function() {
        gadget = Gadget.find(2);
      });

      it("returns true if all conditions in the given hash are equal to the object's properties", function() {
        expect(gadget.meets_conditions({
          price: gadget.price,
          use: gadget.use,
          widget_id: gadget.widget_id}
        )).to(be_true);
      });

      it("returns false if any of the conditions in the given hash are not equal to one of the object's properties", function() {
        expect(gadget.meets_conditions({
          price: gadget.price,
          use: 'crapola',
          widget_id: gadget.widget_id}
        )).to(be_false);
      });
    });
  });
});