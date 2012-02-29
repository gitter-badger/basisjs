
basis.require('basis.dom.event');
basis.require('basis.cssom');
basis.require('basis.data');
basis.require('basis.layout');
basis.require('basis.ui');
basis.require('basis.ui.tree');

(function(basis){

  'use strict';


  //
  // import names
  //

  var wrapper = Function.wrapper;

  var DOM = basis.dom;
  var domEvent = basis.dom.event;
  var classList = basis.cssom.classList;

  var UINode = basis.ui.Node;
  var UIContainer = basis.ui.Container;

  var nsTemplate = basis.template;
  var nsLayout = basis.layout;
  var nsTree = basis.ui.tree;
  var nsResizer = basis.ui.resizer;


  //
  // Main part
  //

  var TYPE_TAG = 1;
  var TYPE_ATTRIBUTE = 2;
  var TYPE_TEXT = 3;
  var TYPE_COMMENT = 8;

  var TOKEN_TYPE = 0
  var TOKEN_BINDINGS = 1;
  var TOKEN_REFS = 2;

  var ATTR_NAME = 3;
  var ATTR_VALUE = 4;

  var ELEMENT_NAME = 3;
  var ELEMENT_ATTRS = 4;
  var ELEMENT_CHILDS = 5;

  var TEXT_VALUE = 3;
  var COMMENT_VALUE = 3;


 /**
  * @class
  */
  var TemplateNode = nsTree.Folder.subclass({
    action: {
      edit: function(event){
        //lazy_EditPanel(this);
        domEvent.kill(event);
      }
    },

    binding: {
      refList: 'satellite:',
      hasRefs: function(node){
        return node.data[TOKEN_REFS] ? 'hasRefs' : '';
      }
    },

    satelliteConfig: {
      refList: {
        existsIf: function(object){
          return object.data[TOKEN_REFS];
        },
        instanceOf: UIContainer.subclass({
          template:
            '<span class="ReferenceList" />',

          childClass: {
            template:
              '<span class="Reference {selected} {disabled}">{title}</span>',

            binding: {
              title: 'title'
            }
          }
        }),
        config: function(owner){
          return {
            childNodes: owner.data[TOKEN_REFS].map(wrapper('title'))
          }
        }
      }
    }
  });


 /**
  * @class
  */
  var AttributeValuePart = UINode.subclass({
    template: '<b>part</b>'
  });


 /**
  * @class
  */
  var AttributeValueClass = UINode.subclass(AttributeValuePart, {
    
  });


 /**
  * @class
  */
  var AttributeValueBinding = UINode.subclass(AttributeValuePart, {
    
  });


 /**
  * @class
  */
  var Attribute = UIContainer.subclass({
    template: 'file:templates/attribute.tmpl',

    binding: {
      name: function(object){
        return object[ATTR_NAME];
      },
      value: function(object){
        return object[ATTR_VALUE];
      },
      hasValue: function(object){
        return object[ATTR_VALUE] ? 'hasValue' : '';
      },
      isEvent: function(object){
        return /^event-(.+)+/.test(object[ATTR_NAME]) ? 'isEvent' : '';
      }
    },

    childClass: AttributeValuePart,

    init: function(config){
      UIContainer.prototype.init.call(this, config);
      //this.setChildNodes([{}, {}])
    }
  });


 /**
  * @class
  */
  var AttributeList = UIContainer.subclass({
    template: 'file:templates/attributeList.tmpl',

    childClass: Attribute/*,

    init: function(){
      UIContainer.prototype.init.call(this);
      this.setChildNodes(this.data[ELEMENT_ATTRS]);
    }*/
  });


 /**
  * @class
  */
  var TagNode = TemplateNode.subclass({
    template: 'file:templates/tagNode.tmpl',

    binding: {
      attributeList: 'satellite:',
      title: function(object){
        return object.data[ELEMENT_NAME];
      }
    },

    satelliteConfig: {
      attributeList: {
        existsIf: function(object){
          return object.data[ELEMENT_ATTRS];
        },

        instanceOf: AttributeList,

        config: function(owner){
          return {
            childNodes: owner.data[ELEMENT_ATTRS]
          }
        }
      }
    }
  });


 /**
  * @class
  */
  var TextNode = TemplateNode.subclass({
    template: 'file:templates/textNode.tmpl',

    binding: {
      value: function(object){
        return object.data[TEXT_VALUE].replace(/\r\n?|\n\r?/g, '\u21b5');
      }
    }
  });


 /**
  * @class
  */
  var CommentNode = TemplateNode.subclass({
    template: 'file:templates/commentNode.tmpl',

    binding: {
      title: function(object){
        return object.data[COMMENT_VALUE];
      }
    }
  });


  var NODE_FACTORY_MAP = {}

  NODE_FACTORY_MAP[TYPE_TAG] = TagNode;
  NODE_FACTORY_MAP[TYPE_TEXT] = TextNode;
  NODE_FACTORY_MAP[TYPE_COMMENT] = CommentNode;

  var nodeFactory = function(config){
    return new NODE_FACTORY_MAP[config[TOKEN_TYPE]]({
      data: config,
      childNodes: config[ELEMENT_CHILDS],
      childFactory: nodeFactory
    });
  }

  var tree = new nsTree.Tree({
    template:
      '<ul tabindex="0" class="devtools-templateTree" event-keydown="keydown" event-focus="focus" event-blur="blur" />',

    action: {
      focus: function(){
        classList(this.element.parentNode.parentNode).add('focus');
      },
      blur: function(){
        classList(this.element.parentNode.parentNode).remove('focus');
      },
      keydown: function(event){
        var key = domEvent.key(event);
        var selected = this.selection.pick();

        switch (key)
        {
          case domEvent.KEY.UP:
          case domEvent.KEY.DOWN:
            var node;
            var axis = this.childAxis;
            var first = axis[0];
            var last = axis[axis.length - 1];

            if (selected)
            {
              var idx = axis.indexOf(selected);

              node = key == domEvent.KEY.UP ? axis[idx - 1] || last : axis[idx + 1] || first;
            }
            else
              node = key == domEvent.KEY.UP ? last : first;

            if (node)
              node.select();

            domEvent.kill(event);
            break;
        }
      }
    },

    childFactory: nodeFactory,

    selection: {
      handler: {
        datasetChanged: function(object, delta){
          /*var selected = this.pick();
          var start = DOM.getSelectionStart(sourceField.tmpl.field);
          var end = start;

          if (selected)
          {
            start = buildOffset(selected, tree).length;
            end = start + buildSource(selected).length;
          }

          DOM.setSelectionRange(sourceField.tmpl.field, start, end);*/
        }
      }
    },

    handler: {
      childNodesModified: function(object, delta){
        this.childAxis = DOM.axis(this, DOM.AXIS_DESCENDANT);
      }
    }
  });


 /**
  * panel
  */
  var widget = new nsLayout.VerticalPanelStack({
    id: 'Viewer',
    childNodes: {
      flex: 1,
      childNodes: tree
    }
  });


 /**
  * resizer
  */
  new nsResizer.Resizer({
    element: widget.element
  });


  //
  // export names
  //
  widget.tree = tree;
  widget.setSource = function(source){
    tree.setChildNodes(nsTemplate.makeDeclaration(source));
  }

  return widget;

})(basis);