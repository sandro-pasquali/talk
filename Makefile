#!/bin/bash

CSS_FILES 	= $(shell find public -not -name "*.min.css" -name '*.css')
JS_FILES 	= $(shell find public -not -name "*.min.js" -name '*.js')

YUI_COMPRESSOR 			= java -jar bin/yuicompressor-2.4.8pre.jar
YUI_COMPRESSOR_FLAGS 	= --charset utf-8
CLOSURE_COMPILER		= java -jar bin/compiler.jar
CLOSURE_FLAGS			=
CSS_MINIFIED 			= $(CSS_FILES:.css=.min.css)
JS_MINIFIED 			= $(JS_FILES:.js=.min.js)

#	This sample test which simply ensures that at least one test exists
#	when we stress our test harness on make.
#
SAMPLE_SPEC = "\
var should 	= require('should');\
var Person = require(__dirname + '/src/dummy-test-to-erase.js');\
describe('Person', function() {\
	it('should say hello', function() {\
		var person 	= new global.joostTesting.Person;\
		person.sayHello('Sandro').should.equal('Hello, Sandro!');\
	});\
});"


SAMPLE_SRC = "global.joostTesting = {};\
global.joostTesting.Person = function() {\
	this.sayHello = function(to) {\
		return 'Hello, ' + to + '!';\
	};\
};"

SAMPLE_SPEC_FILENAME	= "test/dummy-test-to-erase_spec.js"
SAMPLE_SRC_FILENAME		= "test/src/dummy-test-to-erase.js"

#	Copy mies package file into public folder so that client can easily fetch it.
#
MIES_CLIENT	= "public/mies.js"

#	Build NPM modules, pull all submodules, re-minify js and css.
#
all: update install test closer

update:
	@echo "******************************************************************************"
	@echo "UPDATING SUBMODULES"
	@echo "******************************************************************************"

	@git submodule update --init --recursive
	@git submodule foreach git pull origin master

	@echo "******************************************************************************"
	@echo "UPDATING NPM"
	@echo "******************************************************************************"

	@npm update

build:
	@cp node_modules/mies/mies.js $(MIES_CLIENT)

install: update build minify

minify: minify-css minify-js

minify-css: $(CSS_FILES) $(CSS_MINIFIED)

minify-js: $(JS_FILES) $(JS_MINIFIED)

%.min.css: %.css
	$(YUI_COMPRESSOR) $(YUI_COMPRESSOR_FLAGS) --type css $< >$@

%.min.js: %.js
	$(YUI_COMPRESSOR) $(YUI_COMPRESSOR_FLAGS) --type js $< >$@

#	Removes all .min js/css files.
#
minify-clean:
	rm -f $(CSS_MINIFIED) $(JS_MINIFIED)

# 	Removes minified CSS and JS files.
#	Removes all Redis keys beginning with config.db_prefix.
#	NOTE: ^^ All sessions and users and documents are destroyed,
#	and cannot be recovered.
#
clean: minify-clean
	@test $(SAMPLE_SPEC_FILENAME) || rm $(SAMPLE_SPEC_FILENAME)
	@test $(SAMPLE_SRC_FILENAME) || rm $(SAMPLE_SRC_FILENAME)

help:
	@echo 'Cleaning:'
	@echo '  clean          - Delete all minified css/js files, and deletes all Redis keys. **This destroys your build**'
	@echo
	@echo 'Minifying:         **NOTE** Using > yuicompressor --charset utf-8 --verbose.'
	@echo '  minify         - Minify all .js AND .css files.'
	@echo '  minify-css     - Minify all .css files.'
	@echo '  minify-js      - Minify all .js files.'
	@echo '  minify-clean	- Removes all .min js/css files.'
	@echo
	@echo 'Installation:'
	@echo '  install        - Update/install NPM modules, update/install submodules, build core Redis keys.'
	@echo '  uninstall      - clean + removal of Redis entries. NOTE: this means all history is destroyed,'
	@echo '                   including sessions, edit history, everything. Probably not what you want.'
	@echo

#	Create a sample test file, and run tests
#
#	A test/ directory should exist in the distribution (containing at least one test).
#	The src/ subdir is not necessarily present, and we'll need it if not.
#
test:
	@echo "******************************************************************************"
	@echo "RUNNING TESTS"
	@echo "******************************************************************************"

	@test -d test/src || mkdir test/src

	@echo "Creating a sample SPEC file ($(SAMPLE_SPEC_FILENAME)), for testing."
	@echo $(SAMPLE_SPEC) > $(SAMPLE_SPEC_FILENAME)
	@echo "Creating a sample SRC file ($(SAMPLE_SRC_FILENAME)), for testing."
	@echo $(SAMPLE_SRC)	> $(SAMPLE_SRC_FILENAME)

	@export NODE_PATH=.; \
	./node_modules/mocha/bin/mocha \
	--reporter list

closer:
	@echo "******************************************************************************"
	@echo "Completed."
	@echo "NOTE: The /rsa folder keys are for development only. DO NOT use in production."
	@echo "******************************************************************************"

.PHONY: update build install test help clean minify minify-css minify-js minify-clean