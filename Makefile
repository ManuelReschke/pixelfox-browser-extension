VERSION := $(shell jq -r '.version' manifest.json)
PACKAGE_NAME := easy-screenshot-by-pixelfox-$(VERSION).zip
DIST_DIR := dist
PACKAGE_PATH := $(DIST_DIR)/$(PACKAGE_NAME)

.PHONY: package clean

package: clean
	@mkdir -p $(DIST_DIR)
	@zip -r $(PACKAGE_PATH) \
		manifest.json \
		popup.html popup.js \
		options.html options.js \
		result.html result.js \
		ui.css \
		src \
		icons \
		LICENSE \
		README.md
	@echo "Created $(PACKAGE_PATH)"

clean:
	@rm -rf $(DIST_DIR)
