//require("/specs/spec_helper");

Screw.Unit(function() {
  describe("Disco.Model", function() {
    describe(".register", function() {
      describe("when passed a collection resource's url and a constructor function", function() {
        Car = function Car() {};
        var constructor;

        before(function() {
          constructor = Disco.Model.register('/widgets', Car);
        });

        it("sets the given constructor function's prototype to an instance of model and returns it", function() {
          expect(constructor).to(equal, Car);
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
        Car = function Car() {};
        Disco.Model.register('/cars', Car);

        Passenger = function Passenger() {};
        Disco.Model.register('/passengers', Passenger);

        Disco.Model.repository = {
          Car: {
            1: Car.build({
              'maker': "Ford",
              'color': 'red'
            })
          },

          Passenger: {
            1: Passenger.build({
              'name': "Ernie",
              'age': 13
            })
          }
        }

        dataset = {
          'Car': {
            1: {
              'maker': "Toyota",
              'color': 'blue'
            },

            99: {
              'maker': "Tesla",
              'color': 'green'
            }
          },

          'Passenger': {
            1: {
              'name': "Johan",
              'age': 19
            },

            101: {
              'name': "Burt",
              'age': 23
            }
          }
        };
      });

      after(function() {
        delete Car;
        delete Passenger;
        Disco.Model.repository = {};
      });

      it("creates objects that don't yet exist in the given dataset", function() {
        expect(Car.find(99)).to(be_null);
        expect(Passenger.find(101)).to(be_null);

        Disco.Model.merge(dataset);

        var widget_99 = Car.find(99);
        expect(widget_99.id).to(equal, 99);
        expect(widget_99.maker).to(equal, "Tesla");
        expect(widget_99.color).to(equal, 'green');

        var passenger_101 = Passenger.find(101);
        expect(passenger_101.id).to(equal, 101);
        expect(passenger_101.name).to(equal, "Burt");
        expect(passenger_101.age).to(equal, 23);
      });

      it("triggers the 'create' callback on the appropriate constructors after all objects have been inserted", function() {
        var widget_99, passenger_101;

        Car.create(function(car) {
          passenger_101 = Passenger.find(101);
        });
        Passenger.create(function(passenger) {
          widget_99 = Car.find(99);
        })

        Disco.Model.merge(dataset);

        expect(widget_99).to(equal, Car.find(99))
        expect(passenger_101).to(equal, Passenger.find(101))
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
    var all_widgets, all_passengers, Car, Passenger, Driver;
    
    before(function() {
      Car = function Car() {};
      Disco.Model.register('/cars', Car);
      Car.has_one('driver');
      Car.has_many('passengers', {
        order: 'name'
      });
      Car.has_many_through('opinions', 'passengers');
      Car.has_many_through('thoughts', 'passengers', {source: 'opinion'});

      Driver = function Driver() {};
      Disco.Model.register('/drivers', Driver);
      Driver.belongs_to('car');
      
      Passenger = function Passenger() {};
      Disco.Model.register('/passengers', Passenger);
      Passenger.belongs_to('car');
      Passenger.belongs_to('opinion');
      Passenger.belongs_to('thought', { constructor_name: 'Opinion', foreign_key: 'opinion_id' });

      Opinion = function Opinion() {};
      Disco.Model.register('/opinions', Opinion);

      Disco.Model.repository = {
        Car: {
          1: Car.build({
            id: 1,
            maker: 'Chrysler',
            color: 'chartruce'
          }),

          99: Car.build({
            id: 1,
            maker: 'Renault',
            color: 'aqua'
          })
        },
        Driver: {
          1: Driver.build({
            id: 1,
            car_id: 1,
            name: "Nathan"
          }),
          2: Driver.build({
            id: 2,
            car_id: 99,
            name: "Barbara"
          })
        },
        Passenger: {
          2: Passenger.build({
            id: 1,
            car_id: 1,
            opinion_id: 1,
            age: 25,
            gender: 'male',
            name: 'Gavin'
          }),
          33: Passenger.build({
            id: 1,
            car_id: 1,
            opinion_id: 2,
            age: 25,
            gender: 'male',
            name: 'Bertrand'
          }),
          44: Passenger.build({
            id: 1,
            car_id: 2,
            opinion_id: 3,
            age: 18,
            gender: 'female',
            name: 'Helen'
          })
        },
        Opinion: {
          1: Opinion.build({
            id: 1,
            body: "We should turn left"
          }),
          2: Opinion.build({
            id: 2,
            body: "We should turn right"
          }),
          3: Opinion.build({
            id: 3,
            body: "You're driving too fast"
          })
        }
      };

      all_widgets = [];
      for (var id in Disco.Model.repository.Car) {
        all_widgets.push(Disco.Model.repository.Car[id]);
      }

      all_passengers = [];
      for (var id in Disco.Model.repository.Passenger) {
        all_passengers.push(Disco.Model.repository.Passenger[id]);
      }
    });

    after(function() {
      Disco.Model.repository = {};
    });


    describe("associations", function() {
      var car, passenger;

      before(function() {
        car = Car.find(1);
        passenger = Passenger.find(2);
      });

      describe("a has_many association", function() {
        it("returns an array of the associated objects ordered by the requested attribute", function() {
          expect(car.passengers()).to(equal, Passenger.find_all({car_id: 1}, {order: 'name'}));
        });

        describe(".each", function() {
          it("iterates over the items returned by the association", function() {
            var eached = [];
            car.passengers.each(function(passenger) {
              eached.push(passenger);
            })
            expect(eached).to(equal, Passenger.find_all({car_id: 1}, {order: 'name'}));
          });
        });
      });

      describe("a has_many_through association", function() {
        var expected_objects;

        before(function() {
          expected_objects = Passenger.find_all({car_id: 1}, {order: 'name'}).collect(function(passenger) {
            return passenger.opinion();
          });
        });

        describe("with an implicit source name", function() {
          it("returns an array of the associated objects mapped through the through association", function() {
            expect(car.opinions()).to(equal, expected_objects);
          })
        });

        describe("with an explicit source name", function() {
          it("returns an array of the association abjects mapped through the through association with a specific source-name", function() {
            expect(car.thoughts()).to(equal, expected_objects);
          });
        });
      });

      describe("a belongs_to association", function() {
        describe("with an implicit class name and foreign key", function() {
          it("returns the object to which the foreign key points", function() {
            expect(passenger.car()).to(equal, Car.find(passenger.car_id));
          });
        });

        describe("with an explicit constructor name and foreign key", function() {
          it("returns the object to which the foreign key points", function() {
            expect(passenger.thought()).to(equal, Opinion.find(passenger.opinion_id));
          });
        });
      });

      describe("a has_one association", function() {
        it("returns the object with a foreign key to the owner of the association", function() {
          expect(car.driver()).to(equal, Driver.find({car_id: car.id}));
        });
      });
    });

    describe(".find", function() {
      it("when passed an id, finds an object in the repository with that id", function() {
        expect(Car.find(1)).to(equal, Disco.Model.repository.Car[1])
        expect(Car.find(99)).to(equal, Disco.Model.repository.Car[99])
        expect(Passenger.find(2)).to(equal, Disco.Model.repository.Passenger[2])
        expect(Passenger.find(33)).to(equal, Disco.Model.repository.Passenger[33])
      });

      it("when passed a conditions hash, finds the first object in the repository that meets them", function() {
        var car = Car.find(1);
        expect(Car.find({color: car.color})).to(equal, car);
      });
    });

    describe(".find_all", function() {
      it("returns all objects matching the passed in conditions hash, sorted by an optional order column", function() {
        var expected_objects = [];
        Passenger.each(function(passenger) {
          if (passenger.gender == 'male' && passenger.age == 25) {
            expected_objects.push(passenger);
          }
        });
        expect(expected_objects.length > 1).to(be_true);
        expected_objects.sort(function(a, b) {
          return a.name < b.name ? -1 : 1;
        })

        expect(Passenger.find_all({gender: 'male', age: 25}, {order: 'name'})).to(equal, expected_objects);
      });

      describe(".collect", function() {
        it("maps a function over the results of a .find_all", function() {
          var expected_ages = [];
          Passenger.each(function(passenger) {
            if (passenger.age == 25) expected_ages.push(passenger.age);
          });

          expect(Passenger.find_all({age: 25}).collect(function(passenger) {
            return passenger.age;
          })).to(equal, expected_ages);
        });
      });
    });

    describe(".create", function() {
      it("when called with a function, binds the create callback on the constructor", function() {
        var callback_arg;
        Car.create(function(arg) {
          callback_arg = arg;
        });
        Car.trigger('create', ["foo"]);
        expect(callback_arg).to(equal, "foo");
      });

      it("when called without arguments, sends a create request to the constructor's resource url", function() {
        expect($.ajax_requests).to(be_empty);
        Car.create();
        expect($.ajax_requests).to(have_length, 1);
        var request = $.ajax_requests.shift()
        expect(request.url).to(equal, '/cars');
        expect(request.type).to(equal, 'POST');
      });

      it("when called with attributes, sends a create request to the constructor's resource url", function() {
        expect($.ajax_requests).to(be_empty);
        Car.create({ foo: 'bar', baz: 'bop'});
        expect($.ajax_requests).to(have_length, 1);
        var request = $.ajax_requests.shift()
        expect(request.url).to(equal, '/cars');
        expect(request.type).to(equal, 'POST');
        expect(request.data).to(equal, {
          'car[foo]': 'bar',
          'car[baz]': 'bop'
        });
      });

      describe("after a successful response to an ajax request", function() {
        var created_attributes;
        var callback_arg

        before(function() {
          Car.create(function(car) {
            callback_arg = car;
          })

          Car.create({ foo: 'bar', baz: 'bop'})
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
          var car = Car.find(created_attributes.id);
          expect(car.foo).to(equal, created_attributes.foo);
          expect(car.baz).to(equal, created_attributes.baz);
        });

        it("triggers the 'create' callback on the constructor", function() {
          expect(callback_arg).to(equal, Car.find(created_attributes.id));
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
        Car.fetch()
        expect($.ajax_requests).to(have_length, 1);
        var request = $.ajax_requests.shift();

        expect(request.url).to(equal, Car.resource_url);
        expect(request.type).to(equal, 'GET');

        expect(Car.find(2)).to(be_null);
        expect(Passenger.find(4)).to(be_null);

        request.success(JSON.stringify({
          'Car': {
            2: {
              'maker': "Mercedes",
              'color': 'brown'
            }
          },

          'Passenger': {
            4: {
              'age': 31,
              'gender': 'female'
            }
          }
        }));

        expect(Car.find(2)).to_not(be_null);
        expect(Passenger.find(4)).to_not(be_null);
      });

      it("calls the before_merge and after_merge callbacks before and after the merge if they are provided", function() {
        var before_merge, after_merge;

        expect(Car.find(2)).to(be_null);
        Car.fetch({
          before_merge: function() {
            before_merge = Car.find(2);
          },

          after_merge: function() {
            after_merge = Car.find(2);
          }
        });

        $.ajax_requests.shift().success(JSON.stringify({
          'Car': {
            2: {
              'maker': "Death Inc.",
              'color': 23
            }
          }
        }));

        expect(before_merge).to(be_null);
        expect(after_merge).to(equal, Car.find(2));
      });
    });

    describe(".all", function() {
      it("returns an array of all instances of the constructor in the repository", function() {
        expect(Car.all()).to(equal, all_widgets);
      });
    });
    
    describe(".each", function() {
      it("executes the given function on every instance of the constructor in the repository", function() {
        var eached = [];
        Car.each(function(car) {
          eached.push(car)
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
        Car.bind('foo', function(arg) {
          object_1 = this;
          argument_1 = arg;
        });

        Car.bind('foo', function(arg) {
          object_2 = this;
          argument_2 = arg;
        });

        var arg = new Object();
        Car.trigger('foo', [arg]);

        expect(object_1).to(equal, Car);
        expect(object_2).to(equal, Car);
        expect(argument_1).to(equal, arg);
        expect(argument_2).to(equal, arg);
      });
    });
    
    describe("#fetch", function() {
      it("sends a get request to the instance's resource url and merges the resulting dataset", function() {
        var car = Car.find(1);

        expect($.ajax_requests).to(be_empty);

        car.fetch();

        expect($.ajax_requests).to(have_length, 1);
        var request = $.ajax_requests.shift();
        expect(request.url).to(equal, "/cars/1");
        expect(request.type).to(equal, "GET");

        expect(Passenger.find(3)).to(be_null);
        expect(Passenger.find(4)).to(be_null);

        request.success(JSON.stringify({
          'Passenger': {
            3: {
              'age': "coffee",
              'gender': 300
            },

            4: {
              'age': "cigarettes",
              'gender': 3
            }
          }
        }));

        expect(Passenger.find(3)).to_not(be_null);
        expect(Passenger.find(4)).to_not(be_null);
      });

      it("calls the before_merge and after_merge callbacks before and after the merge if they are provided", function() {
        var before_merge, after_merge;
        var car = Car.find(1);

        expect(Passenger.find(3)).to(be_null);

        car.fetch({
          before_merge: function() {
            before_merge = Passenger.find(3);
          },

          after_merge: function() {
            after_merge = Passenger.find(3);
          }
        });

        $.ajax_requests.shift().success(JSON.stringify({
          'Passenger': {
            3: {
              'age': "coffee",
              'gender': 300
            }
          }
        }));

        expect(before_merge).to(be_null);
        expect(after_merge).to(equal, Passenger.find(3));
      });
    });
    
    describe("#resource_url", function() {
      it("returns the object's id appended to its constructor's resource url", function() {
        var car = Car.find(1);
        expect(car.resource_url()).to(equal, "/cars/1");
      });
    });

    describe("#meets_conditions", function() {
      var passenger;
      before(function() {
        passenger = Passenger.find(2);
      });

      it("returns true if all conditions in the given hash are equal to the object's properties", function() {
        expect(passenger.meets_conditions({
          gender: passenger.gender,
          age: passenger.age,
          car_id: passenger.car_id}
        )).to(be_true);
      });

      it("returns false if any of the conditions in the given hash are not equal to one of the object's properties", function() {
        expect(passenger.meets_conditions({
          gender: passenger.gender,
          age: 'crapola',
          car_id: passenger.car_id}
        )).to(be_false);
      });
    });
  });
});