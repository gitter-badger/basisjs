
 /**
  * @namespace basis.l10n
  */

  var namespace = this.path;


  //
  // import names
  //

  var Class = basis.Class;
  var arrayFrom = basis.array.from;

  // process .l10n files as .json
  basis.resource.extensions['.l10n'] = basis.resource.extensions['.json'];


  //
  // Token
  //

  var tokenIndex = [];
  var tokenEnums = {};

  function ownKeys(object){
    var result = [];

    for (var key in object)
      if (Object.prototype.hasOwnProperty.call(object, key))
        result.push(key);

    return result;
  }

 /**
  * @class
  */ 
  var ComputeToken = Class(basis.Token, {
    className: namespace + '.ComputeToken',

    value: '',
    values: null,
    valueGetter: function(object){
    },

    token: null,
    tokenHandler: function(value){
      this.values = typeof value == 'object' || Array.isArray(value)
        ? ownKeys(value)
        : null;

      this.evaluate();
    },
    valueToken: null,

    object: null,
    objectHandler: null,

   /**
    * @constructor
    */ 
    init: function(token, object, objectHandler, valueGetter){
      basis.Token.prototype.init.call(this);

      this.valueGetter = valueGetter;
      this.objectHandler = objectHandler;
      this.setToken(token);
      this.setObject(object);
    },

    setToken: function(token){
      if (this.token !== token)
      {
        if (this.token)
          this.token.detach(this.tokenHandler, this)

        this.token = token;
        this.values = null;

        if (token)
        {
          token.attach(this.tokenHandler, this);
          this.tokenHandler(token.get());
        }
      }
    },
    setObject: function(object){
      if (this.object !== object)
      {
        if (this.object)
          this.object.removeHandler(this.objectHandler, this);

        this.object = object;

        if (object)
        {
          object.addHandler(this.objectHandler, this);
          this.evaluate();
        }
      }
    },

    evaluate: function(){
      var token = null;

      if (this.values && this.object)
        token = this.token.dictionary.token(this.token.name + '.' + this.valueGetter(this.object));

      if (this.valueToken !== token)
      {
        if (this.valueToken)
          this.valueToken.detach(this.set, this);

        this.valueToken = token;

        if (token)
          token.attach(this.set, this);
      }

      this.set(this.valueToken ? this.valueToken.value : '[l10n:uncomputable value]');
    },

    toString: function(){
      return this.value;
    },

    get: function(){
      return this.value;
    },
    set: function(value){
      if (value != this.value)
      {
        this.value = value;
        this.apply();
      }
    },

    destroy: function(){
      this.setObject();
      this.setToken();
      this.evaluate();      
      this.value = null;
      this.values = null;
      
      basis.Token.prototype.destroy.call(this);
    }
  });

 /**
  * @class
  */ 
  var Token = Class(basis.Token, {
    className: namespace + '.Token',

    value: '',

   /**
    * @type {number}
    */ 
    index: NaN,

    toString: function(){
      return this.value;
    },

   /**
    * @constructor
    */ 
    init: function(dictionary, tokenName){
      basis.Token.prototype.init.call(this);

      this.index = tokenIndex.push(this) - 1;
      this.name = tokenName;
      this.dictionary = dictionary;
    },

    get: function(){
      return this.value;
    },
    set: function(value){
      if (value != this.value)
      {
        this.value = value;
        this.apply();
      }
    },

    compute: function(events, getter){
      if (arguments.length == 1)
      {
        getter = events;
        events = '';
      }

      getter = basis.getter(getter);
      events = String(events).trim().split(/\s+|\s*,\s*/).sort();

      var enumId = events.concat(getter.basisGetterId_).join('_');

      if (tokenEnums[enumId])
        return tokenEnums[enumId];

      var token = this;
      var computeTokenMap = {};
      var updateValue = function(){
        this.evaluate();
      };
      var handler = {
        destroy: function(object){
          delete computeTokenMap[object.basisObjectId];
          this.destroy();
        }
      };

      for (var i = 0, eventName; eventName = events[i]; i++)
        if (eventName != 'destroy')
          handler[eventName] = updateValue;

      return tokenEnums[enumId] = function(object){
        if (object instanceof basis.event.Emitter == false)
          throw 'basis.l10n.Token#compute: object must be an instanceof basis.event.Emitter';

        var objectId = object.basisObjectId;
        var computeToken = computeTokenMap[objectId];

        if (!computeToken)
          computeToken = computeTokenMap[objectId] = new ComputeToken(token, object, handler, getter);

        return computeToken;
      }
    },

   /**
    * @destructor
    */ 
    destroy: function(){
      this.value = null;
      basis.Token.prototype.destroy.call(this);
    }
  });


 /**
  * Returns token for path. Path also may be index reference, that used in production.
  * @example
  *   basis.l10n.token('token.path@path/to/dict');  // token by name and dictionary location
  *   basis.l10n.token('#123');  // get token by base 36 index, use in production
  * @name basis.l10n.token
  * @param {string} path
  * @return {basis.l10n.Token}
  */
  function getToken(path){
    if (path.charAt(0) == '#')
    {
      // return index by absolute index
      return tokenIndex[parseInt(path.substr(1), 36)];
    }
    else
    {
      var parts = path.match(/^(.+?)@(.+)$/);

      if (parts)
        return resolveDictionary(parts[2]).token(parts[1]);

      ;;;basis.dev.warn('basis.l10n.token accepts token references in format token.path@path/to/dict.l10n');
    }
  }


  //
  // Dictionary
  //

  var dictionaryLocations = {};
  var resourcesLoaded = {};
  var dictionaries = {};
  var dictionaryUpdateListeners = [];

  var dictionaryByLocation = {};
  var dictionaryList = [];


 /**
  * @class
  */
  var Dictionary = Class(null, {
    className: namespace + '.Dictionary',

    name: '[noname]',
    tokens: null,
    resources: null,

   /**
    * @type {number}
    */ 
    index: NaN,

   /**
    * @constructor
    * @param {string} name Dictionary name
    */ 
    init: function(resource){
      this.tokens = {};
      this.resources = {};

      this.resource = resource;
      this.update(resource());
      resource.attach(this.update, this);

      this.index = dictionaryList.push(this) - 1;

      createDictionaryNotifier.notify(resource.url);
    },

   /**
    * @param {string} culture Culture name
    * @param {object} tokens Object that contains new tokens data
    */ 
    update: function(data){
      function walkTokens(culture, tokens, path){
        // for (var tokenName in this.tokens)
        //   if (!tokens[tokenName])
        //     this.setCultureValue(culture, tokenName, '');

        if (path)
          path += '.';
        
        for (var tokenName in tokens)
          if (Object.prototype.hasOwnProperty.call(tokens, tokenName))
          {
            var value = tokens[tokenName];

            this.setCultureValue(culture, path + tokenName, tokens[tokenName]);

            if (value && (typeof value == 'object' || Array.isArray(value)))
              walkTokens.call(this, culture, value, path + tokenName);
          }
      }

      for (var culture in data)
        walkTokens.call(this, culture, data[culture], '');
    },

   /**
    * @param {string} culture Culture name
    */ 
    setCulture: function(culture){
      for (var tokenName in this.tokens)
        this.setTokenValue(culture, tokenName);
    },

   /**
    * @param {string} culture Culture name
    * @param {string} tokenName Token name
    * @return {*}
    */ 
    getTokenValue: function(culture, tokenName){
      return this.getCultureValue(culture, tokenName) || this.getCultureValue('base', tokenName);
    },

   /**
    * @param {string} culture Culture name
    * @param {string} tokenName Token name
    */ 
    setTokenValue: function(culture, tokenName){
      this.tokens[tokenName].set(cultureGetTokenValue[culture]
        ? cultureGetTokenValue[culture].call(this, tokenName)
        : this.getTokenValue(culture, tokenName)
      );
    },

   /**
    * @param {string} culture Culture name
    * @param {string} tokenName Token name
    * @return {*}
    */ 
    getCultureValue: function(culture, tokenName){
      return this.resources[culture] && this.resources[culture][tokenName];
    },    

   /**
    * @param {string} culture Culture name
    * @param {string} tokenName Token name
    * @param {string} tokenValue New token value
    */ 
    setCultureValue: function(culture, tokenName, tokenValue){
      var resource = this.resources[culture];

      if (!resource)
        resource = this.resources[culture] = {};

      resource[tokenName] = tokenValue;

      if (this.tokens[tokenName] && (culture == 'base' || culture == currentCulture))
        this.setTokenValue(currentCulture, tokenName);
    },

   /**
    * @param {string} tokenName Token name
    */ 
    token: function(tokenName){
      if (tokenName in this.tokens == false)
      {
        this.tokens[tokenName] = new Token(this, tokenName);
        this.setTokenValue(currentCulture, tokenName);
      }

      return this.tokens[tokenName];
    },

    getToken: function(tokenName){
      ;;;console.log('Dictionary#getToken is deprecated now, use Dictionary#token instead');
      return this.token(tokenName);
    },

   /**
    * @destructor
    */ 
    destroy: function(){
      this.tokens = null;
      this.resources = null;
    }
  });


 /**
  * @param {string} location
  * @return {basis.l10n.Dictionary}
  */ 
  function resolveDictionary(location){
    var extname = basis.path.extname(location);
    var resource = basis.resource(extname != '.l10n' ? basis.path.dirname(location) + '/' + basis.path.basename(location, extname) + '.l10n' : location);
    var dictionary = dictionaryByLocation[resource.url];

    if (!dictionary)
      dictionary = dictionaryByLocation[resource.url] = new Dictionary(resource);

    return dictionary;
  }


 /**
  * @param {Array.<string>} cultureList
  * @return {function(tokenName)}
  */
  function createGetTokenValueFunction(cultureList){
    return function(tokenName){
      for (var i = 0, culture, value; culture = cultureList[i++];)
        if (value = this.getCultureValue(culture, tokenName))
          return value;

      return this.getCultureValue('base', tokenName);
    }
  }


 /**
  * Returns list of all dictionaries. Using in development mode.
  * @return {Array.<basis.l10n.Dictionary>}
  */
  function getDictionaries(){
    return dictionaryList;
  }

 /**
  * 
  */
  var createDictionaryNotifier = new basis.Token();
  basis.object.extend(createDictionaryNotifier, {
    notify: function(value){
      this.value = value;
      this.apply();
    },
    get: function(){
      return this.value;
    }
  });


  //
  // Culture
  //

  var currentCulture = 'en-US';
  var cultureList = [];
  var cultureGetTokenValue = {};
  var cultureFallback = {}; 
  var cultureChangeHandlers = [];
  var cultures = {};


 /**
  * @class
  */
  var Culture = basis.Class(null, {
    name: '',
    init: function(name){
      this.name = name;
    }
  });

 /**
  * 
  */
  function resolveCulture(name){
    var culture = cultures[name];

    if (!culture)
      culture = cultures[name] = new Culture(name);

    return culture;
  }

 /**
  * Returns current culture name.
  * @return {string} Current culture name.
  */ 
  function getCulture(){
    return currentCulture;
  }


 /**
  * Set new culture.
  * @param {string} culture Culture name.
  */ 
  function setCulture(culture){
    if (!culture)
      culture = 'base';

    if (currentCulture != culture)
    {
      currentCulture = culture;

      for (var i = 0, dictionary; dictionary = dictionaryList[i]; i++)
        dictionary.setCulture(currentCulture);

      for (var i = 0, handler; handler = cultureChangeHandlers[i]; i++)
        handler.fn.call(handler.context, culture);
    }
  }


 /**
  * Returns current culture list.
  * @return {Array.<string>}
  */ 
  function getCultureList(){
    return cultureList;
  }


 /**
  * Set new culture list.
  * @example
  *   basis.l10n.setCultureList(['ru-RU', 'en-US']);
  *   basis.l10n.setCultureList('ru-RU en-US');
  *
  *   // set culture list with fallback for uk-UA
  *   basis.l10n.setCultureList('ru-RU uk-UA/ru-RU en-US');
  * @param {Array.<string>|string} list
  */
  function setCultureList(list){
    if (typeof list == 'string')
      list = list.qw();

    var cultures = [];
    var cultureRow;

    for (var i = 0, culture; culture = list[i]; i++)
    {
      cultureRow = culture.split('/');
      cultures.push(cultureRow[0]);
      cultureGetTokenValue[cultureRow[0]] = createGetTokenValueFunction(cultureRow);
      cultureFallback[cultureRow[0]] = cultureRow.slice(1);
    }

    cultureList = cultures;
  }


 /**
  * Add callback on culture change.
  * @param {function(culture)} fn Callback
  * @param {context=} context Context for callback
  * @param {boolean=} fire If true callback will be invoked with current
  *   culture name right after callback attachment.
  */ 
  function onCultureChange(fn, context, fire){
    cultureChangeHandlers.push({
      fn: fn,
      context: context
    });

    if (fire)
      fn.call(context, currentCulture);
  }


  //
  // exports
  //

  module.exports = {
    ComputeToken: ComputeToken,
    Token: Token,
    token: getToken,
    getToken: function(){
      ;;;basis.dev.warn('basis.l10n.getToken is deprecated, use basis.l10n.token instead');
      return getToken.apply(this, arguments);
    },
    
    dictionary: resolveDictionary,
    /** dev */ getDictionaries: getDictionaries,
    /** dev */ addCreateDictionaryHandler: createDictionaryNotifier.attach.bind(createDictionaryNotifier),
    /** dev */ removeCreateDictionaryHandler: createDictionaryNotifier.detach.bind(createDictionaryNotifier),

    culture: resolveCulture,
    getCulture: getCulture,
    setCulture: setCulture,
    getCultureList: getCultureList,
    setCultureList: setCultureList,

    onCultureChange: onCultureChange
  };
