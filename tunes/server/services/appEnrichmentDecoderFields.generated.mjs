var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};

// node_modules/zod/v3/external.js
var external_exports = {};
__export(external_exports, {
  BRAND: () => BRAND,
  DIRTY: () => DIRTY,
  EMPTY_PATH: () => EMPTY_PATH,
  INVALID: () => INVALID,
  NEVER: () => NEVER,
  OK: () => OK,
  ParseStatus: () => ParseStatus,
  Schema: () => ZodType,
  ZodAny: () => ZodAny,
  ZodArray: () => ZodArray,
  ZodBigInt: () => ZodBigInt,
  ZodBoolean: () => ZodBoolean,
  ZodBranded: () => ZodBranded,
  ZodCatch: () => ZodCatch,
  ZodDate: () => ZodDate,
  ZodDefault: () => ZodDefault,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodEffects: () => ZodEffects,
  ZodEnum: () => ZodEnum,
  ZodError: () => ZodError,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodFunction: () => ZodFunction,
  ZodIntersection: () => ZodIntersection,
  ZodIssueCode: () => ZodIssueCode,
  ZodLazy: () => ZodLazy,
  ZodLiteral: () => ZodLiteral,
  ZodMap: () => ZodMap,
  ZodNaN: () => ZodNaN,
  ZodNativeEnum: () => ZodNativeEnum,
  ZodNever: () => ZodNever,
  ZodNull: () => ZodNull,
  ZodNullable: () => ZodNullable,
  ZodNumber: () => ZodNumber,
  ZodObject: () => ZodObject,
  ZodOptional: () => ZodOptional,
  ZodParsedType: () => ZodParsedType,
  ZodPipeline: () => ZodPipeline,
  ZodPromise: () => ZodPromise,
  ZodReadonly: () => ZodReadonly,
  ZodRecord: () => ZodRecord,
  ZodSchema: () => ZodType,
  ZodSet: () => ZodSet,
  ZodString: () => ZodString,
  ZodSymbol: () => ZodSymbol,
  ZodTransformer: () => ZodEffects,
  ZodTuple: () => ZodTuple,
  ZodType: () => ZodType,
  ZodUndefined: () => ZodUndefined,
  ZodUnion: () => ZodUnion,
  ZodUnknown: () => ZodUnknown,
  ZodVoid: () => ZodVoid,
  addIssueToContext: () => addIssueToContext,
  any: () => anyType,
  array: () => arrayType,
  bigint: () => bigIntType,
  boolean: () => booleanType,
  coerce: () => coerce,
  custom: () => custom,
  date: () => dateType,
  datetimeRegex: () => datetimeRegex,
  defaultErrorMap: () => en_default,
  discriminatedUnion: () => discriminatedUnionType,
  effect: () => effectsType,
  enum: () => enumType,
  function: () => functionType,
  getErrorMap: () => getErrorMap,
  getParsedType: () => getParsedType,
  instanceof: () => instanceOfType,
  intersection: () => intersectionType,
  isAborted: () => isAborted,
  isAsync: () => isAsync,
  isDirty: () => isDirty,
  isValid: () => isValid,
  late: () => late,
  lazy: () => lazyType,
  literal: () => literalType,
  makeIssue: () => makeIssue,
  map: () => mapType,
  nan: () => nanType,
  nativeEnum: () => nativeEnumType,
  never: () => neverType,
  null: () => nullType,
  nullable: () => nullableType,
  number: () => numberType,
  object: () => objectType,
  objectUtil: () => objectUtil,
  oboolean: () => oboolean,
  onumber: () => onumber,
  optional: () => optionalType,
  ostring: () => ostring,
  pipeline: () => pipelineType,
  preprocess: () => preprocessType,
  promise: () => promiseType,
  quotelessJson: () => quotelessJson,
  record: () => recordType,
  set: () => setType,
  setErrorMap: () => setErrorMap,
  strictObject: () => strictObjectType,
  string: () => stringType,
  symbol: () => symbolType,
  transformer: () => effectsType,
  tuple: () => tupleType,
  undefined: () => undefinedType,
  union: () => unionType,
  unknown: () => unknownType,
  util: () => util,
  void: () => voidType
});

// node_modules/zod/v3/helpers/util.js
var util;
(function(util2) {
  util2.assertEqual = (_) => {
  };
  function assertIs(_arg) {
  }
  util2.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  util2.assertNever = assertNever;
  util2.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util2.getValidEnumValues = (obj) => {
    const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj[k];
    }
    return util2.objectValues(filtered);
  };
  util2.objectValues = (obj) => {
    return util2.objectKeys(obj).map(function(e) {
      return obj[e];
    });
  };
  util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
    const keys = [];
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        keys.push(key);
      }
    }
    return keys;
  };
  util2.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return void 0;
  };
  util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  util2.joinValues = joinValues;
  util2.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util || (util = {}));
var objectUtil;
(function(objectUtil2) {
  objectUtil2.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
      // second overwrites first
    };
  };
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);
var getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
};

// node_modules/zod/v3/ZodError.js
var ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
var quotelessJson = (obj) => {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:");
};
var ZodError = class _ZodError extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = (error) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    };
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof _ZodError)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        const firstEl = sub.path[0];
        fieldErrors[firstEl] = fieldErrors[firstEl] || [];
        fieldErrors[firstEl].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
};
ZodError.create = (issues) => {
  const error = new ZodError(issues);
  return error;
};

// node_modules/zod/v3/locales/en.js
var errorMap = (issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "bigint")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
};
var en_default = errorMap;

// node_modules/zod/v3/errors.js
var overrideErrorMap = en_default;
function setErrorMap(map) {
  overrideErrorMap = map;
}
function getErrorMap() {
  return overrideErrorMap;
}

// node_modules/zod/v3/helpers/parseUtil.js
var makeIssue = (params) => {
  const { data, path, errorMaps, issueData } = params;
  const fullPath = [...path, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== void 0) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
};
var EMPTY_PATH = [];
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === en_default ? void 0 : en_default
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}
var ParseStatus = class _ParseStatus {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return _ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
};
var INVALID = Object.freeze({
  status: "aborted"
});
var DIRTY = (value) => ({ status: "dirty", value });
var OK = (value) => ({ status: "valid", value });
var isAborted = (x) => x.status === "aborted";
var isDirty = (x) => x.status === "dirty";
var isValid = (x) => x.status === "valid";
var isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;

// node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
(function(errorUtil2) {
  errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));

// node_modules/zod/v3/types.js
var ParseInputLazyPath = class {
  constructor(parent, value, path, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (Array.isArray(this._key)) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
};
var handleResult = (ctx, result) => {
  if (isValid(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error = new ZodError(ctx.common.issues);
        this._error = error;
        return this._error;
      }
    };
  }
};
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = (iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  };
  return { errorMap: customMap, description };
}
var ZodType = class {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    const ctx = {
      common: {
        issues: [],
        async: params?.async ?? false,
        contextualErrorMap: params?.errorMap
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result);
  }
  "~validate"(data) {
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if (err?.message?.toLowerCase()?.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: true
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }
  refine(check, message) {
    const getIssueProperties = (val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    };
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError = () => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      });
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data)
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
};
var cuidRegex = /^c[^\s-]{8,}$/i;
var cuid2Regex = /^[0-9a-z]+$/;
var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex = /^[a-z0-9_-]{21}$/i;
var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
var emojiRegex;
var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    if (!header)
      return false;
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
var ZodString = class _ZodString extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.string,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "length") {
        const tooBig = input.data.length > check.value;
        const tooSmall = input.data.length < check.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          } else if (tooSmall) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          }
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "emoji") {
        if (!emojiRegex) {
          emojiRegex = new RegExp(_emojiRegex, "u");
        }
        if (!emojiRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "emoji",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "nanoid") {
        if (!nanoidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "nanoid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid2") {
        if (!cuid2Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid2",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ulid") {
        if (!ulidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ulid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "includes") {
        if (!input.data.includes(check.value, check.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { includes: check.value, position: check.position },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check.kind === "startsWith") {
        if (!input.data.startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { startsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!input.data.endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { endsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "datetime") {
        const regex = datetimeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "datetime",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "date") {
        const regex = dateRegex;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "date",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "time") {
        const regex = timeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "time",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "duration") {
        if (!durationRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "duration",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ip") {
        if (!isValidIP(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ip",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "jwt") {
        if (!isValidJWT(input.data, check.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "jwt",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cidr") {
        if (!isValidCidr(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cidr",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64") {
        if (!base64Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64url") {
        if (!base64urlRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode.invalid_string,
      ...errorUtil.errToObj(message)
    });
  }
  _addCheck(check) {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
  }
  datetime(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      offset: options?.offset ?? false,
      local: options?.local ?? false,
      ...errorUtil.errToObj(options?.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options
      });
    }
    return this._addCheck({
      kind: "time",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      ...errorUtil.errToObj(options?.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options?.position,
      ...errorUtil.errToObj(options?.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil.errToObj(message)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(message) {
    return this.min(1, errorUtil.errToObj(message));
  }
  trim() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodString.create = (params) => {
  return new ZodString({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodString,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
var ZodNumber = class _ZodNumber extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_finite,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
  }
  get isFinite() {
    let max = null;
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
};
ZodNumber.create = (params) => {
  return new ZodNumber({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodNumber,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodBigInt = class _ZodBigInt extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch {
        return this._getInvalidInput(input);
      }
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            type: "bigint",
            minimum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            type: "bigint",
            maximum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (input.data % check.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.bigint,
      received: ctx.parsedType
    });
    return INVALID;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodBigInt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodBigInt.create = (params) => {
  return new ZodBigInt({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodBigInt,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
var ZodBoolean = class extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodBoolean.create = (params) => {
  return new ZodBoolean({
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodDate = class _ZodDate extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    if (Number.isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_date
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            message: check.message,
            inclusive: true,
            exact: false,
            minimum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            message: check.message,
            inclusive: true,
            exact: false,
            maximum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check) {
    return new _ZodDate({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
};
ZodDate.create = (params) => {
  return new ZodDate({
    checks: [],
    coerce: params?.coerce || false,
    typeName: ZodFirstPartyTypeKind.ZodDate,
    ...processCreateParams(params)
  });
};
var ZodSymbol = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.symbol,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodSymbol.create = (params) => {
  return new ZodSymbol({
    typeName: ZodFirstPartyTypeKind.ZodSymbol,
    ...processCreateParams(params)
  });
};
var ZodUndefined = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodUndefined.create = (params) => {
  return new ZodUndefined({
    typeName: ZodFirstPartyTypeKind.ZodUndefined,
    ...processCreateParams(params)
  });
};
var ZodNull = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodNull.create = (params) => {
  return new ZodNull({
    typeName: ZodFirstPartyTypeKind.ZodNull,
    ...processCreateParams(params)
  });
};
var ZodAny = class extends ZodType {
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodAny.create = (params) => {
  return new ZodAny({
    typeName: ZodFirstPartyTypeKind.ZodAny,
    ...processCreateParams(params)
  });
};
var ZodUnknown = class extends ZodType {
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodUnknown.create = (params) => {
  return new ZodUnknown({
    typeName: ZodFirstPartyTypeKind.ZodUnknown,
    ...processCreateParams(params)
  });
};
var ZodNever = class extends ZodType {
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType
    });
    return INVALID;
  }
};
ZodNever.create = (params) => {
  return new ZodNever({
    typeName: ZodFirstPartyTypeKind.ZodNever,
    ...processCreateParams(params)
  });
};
var ZodVoid = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodVoid.create = (params) => {
  return new ZodVoid({
    typeName: ZodFirstPartyTypeKind.ZodVoid,
    ...processCreateParams(params)
  });
};
var ZodArray = class _ZodArray extends ZodType {
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext(ctx, {
          code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
          minimum: tooSmall ? def.exactLength.value : void 0,
          maximum: tooBig ? def.exactLength.value : void 0,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all([...ctx.data].map((item, i) => {
        return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      })).then((result2) => {
        return ParseStatus.mergeArray(status, result2);
      });
    }
    const result = [...ctx.data].map((item, i) => {
      return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
    });
    return ParseStatus.mergeArray(status, result);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new _ZodArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) }
    });
  }
  max(maxLength, message) {
    return new _ZodArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) }
    });
  }
  length(len, message) {
    return new _ZodArray({
      ...this._def,
      exactLength: { value: len, message: errorUtil.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodArray.create = (schema, params) => {
  return new ZodArray({
    type: schema,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind.ZodArray,
    ...processCreateParams(params)
  });
};
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: () => newShape
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}
var ZodObject = class _ZodObject extends ZodType {
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    this._cached = { shape, keys };
    return this._cached;
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }
    const pairs = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] }
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.unrecognized_keys,
            keys: extraKeys
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") {
      } else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: catchall._parse(
            new ParseInputLazyPath(ctx, value, ctx.path, key)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: key in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value,
            alwaysSet: pair.alwaysSet
          });
        }
        return syncPairs;
      }).then((syncPairs) => {
        return ParseStatus.mergeObjectSync(status, syncPairs);
      });
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil.errToObj;
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strict",
      ...message !== void 0 ? {
        errorMap: (issue, ctx) => {
          const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
          if (issue.code === "unrecognized_keys")
            return {
              message: errorUtil.errToObj(message).message ?? defaultError
            };
          return {
            message: defaultError
          };
        }
      } : {}
    });
  }
  strip() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(augmentation) {
    return new _ZodObject({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...augmentation
      })
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(merging) {
    const merged = new _ZodObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }),
      typeName: ZodFirstPartyTypeKind.ZodObject
    });
    return merged;
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(key, schema) {
    return this.augment({ [key]: schema });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(index) {
    return new _ZodObject({
      ...this._def,
      catchall: index
    });
  }
  pick(mask) {
    const shape = {};
    for (const key of util.objectKeys(mask)) {
      if (mask[key] && this.shape[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  omit(mask) {
    const shape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (!mask[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return deepPartialify(this);
  }
  partial(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      const fieldSchema = this.shape[key];
      if (mask && !mask[key]) {
        newShape[key] = fieldSchema;
      } else {
        newShape[key] = fieldSchema.optional();
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  required(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (mask && !mask[key]) {
        newShape[key] = this.shape[key];
      } else {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional) {
          newField = newField._def.innerType;
        }
        newShape[key] = newField;
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  keyof() {
    return createZodEnum(util.objectKeys(this.shape));
  }
};
ZodObject.create = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.strictCreate = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strict",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.lazycreate = (shape, params) => {
  return new ZodObject({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
var ZodUnion = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result of results) {
        if (result.result.status === "valid") {
          return result.result;
        }
      }
      for (const result of results) {
        if (result.result.status === "dirty") {
          ctx.common.issues.push(...result.ctx.common.issues);
          return result.result;
        }
      }
      const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return Promise.all(options.map(async (option) => {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    } else {
      let dirty = void 0;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        const result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result.status === "valid") {
          return result;
        } else if (result.status === "dirty" && !dirty) {
          dirty = { result, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError(issues2));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
  }
  get options() {
    return this._def.options;
  }
};
ZodUnion.create = (types, params) => {
  return new ZodUnion({
    options: types,
    typeName: ZodFirstPartyTypeKind.ZodUnion,
    ...processCreateParams(params)
  });
};
var getDiscriminator = (type) => {
  if (type instanceof ZodLazy) {
    return getDiscriminator(type.schema);
  } else if (type instanceof ZodEffects) {
    return getDiscriminator(type.innerType());
  } else if (type instanceof ZodLiteral) {
    return [type.value];
  } else if (type instanceof ZodEnum) {
    return type.options;
  } else if (type instanceof ZodNativeEnum) {
    return util.objectValues(type.enum);
  } else if (type instanceof ZodDefault) {
    return getDiscriminator(type._def.innerType);
  } else if (type instanceof ZodUndefined) {
    return [void 0];
  } else if (type instanceof ZodNull) {
    return [null];
  } else if (type instanceof ZodOptional) {
    return [void 0, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodNullable) {
    return [null, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodBranded) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodReadonly) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodCatch) {
    return getDiscriminator(type._def.innerType);
  } else {
    return [];
  }
};
var ZodDiscriminatedUnion = class _ZodDiscriminatedUnion extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const discriminator = this.discriminator;
    const discriminatorValue = ctx.data[discriminator];
    const option = this.optionsMap.get(discriminatorValue);
    if (!option) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union_discriminator,
        options: Array.from(this.optionsMap.keys()),
        path: [discriminator]
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return option._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    } else {
      return option._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    }
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create(discriminator, options, params) {
    const optionsMap = /* @__PURE__ */ new Map();
    for (const type of options) {
      const discriminatorValues = getDiscriminator(type.shape[discriminator]);
      if (!discriminatorValues.length) {
        throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
      }
      for (const value of discriminatorValues) {
        if (optionsMap.has(value)) {
          throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
        }
        optionsMap.set(value, type);
      }
    }
    return new _ZodDiscriminatedUnion({
      typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
      discriminator,
      options,
      optionsMap,
      ...processCreateParams(params)
    });
  }
};
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
var ZodIntersection = class extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = (parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) {
        return INVALID;
      }
      const merged = mergeValues(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_intersection_types
        });
        return INVALID;
      }
      if (isDirty(parsedLeft) || isDirty(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    };
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        })
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(this._def.left._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }), this._def.right._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }));
    }
  }
};
ZodIntersection.create = (left, right, params) => {
  return new ZodIntersection({
    left,
    right,
    typeName: ZodFirstPartyTypeKind.ZodIntersection,
    ...processCreateParams(params)
  });
};
var ZodTuple = class _ZodTuple extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      return INVALID;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      status.dirty();
    }
    const items = [...ctx.data].map((item, itemIndex) => {
      const schema = this._def.items[itemIndex] || this._def.rest;
      if (!schema)
        return null;
      return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
    }).filter((x) => !!x);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus.mergeArray(status, results);
      });
    } else {
      return ParseStatus.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new _ZodTuple({
      ...this._def,
      rest
    });
  }
};
ZodTuple.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple({
    items: schemas,
    typeName: ZodFirstPartyTypeKind.ZodTuple,
    rest: null,
    ...processCreateParams(params)
  });
};
var ZodRecord = class _ZodRecord extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const pairs = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
        value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (ctx.common.async) {
      return ParseStatus.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    if (second instanceof ZodType) {
      return new _ZodRecord({
        keyType: first,
        valueType: second,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(third)
      });
    }
    return new _ZodRecord({
      keyType: ZodString.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(second)
    });
  }
};
var ZodMap = class extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs = [...ctx.data.entries()].map(([key, value], index) => {
      return {
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
        value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = /* @__PURE__ */ new Map();
      for (const pair of pairs) {
        const key = pair.key;
        const value = pair.value;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
};
ZodMap.create = (keyType, valueType, params) => {
  return new ZodMap({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind.ZodMap,
    ...processCreateParams(params)
  });
};
var ZodSet = class _ZodSet extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements2) {
      const parsedSet = /* @__PURE__ */ new Set();
      for (const element of elements2) {
        if (element.status === "aborted")
          return INVALID;
        if (element.status === "dirty")
          status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
    if (ctx.common.async) {
      return Promise.all(elements).then((elements2) => finalizeSet(elements2));
    } else {
      return finalizeSet(elements);
    }
  }
  min(minSize, message) {
    return new _ZodSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) }
    });
  }
  max(maxSize, message) {
    return new _ZodSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) }
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodSet.create = (valueType, params) => {
  return new ZodSet({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind.ZodSet,
    ...processCreateParams(params)
  });
};
var ZodFunction = class _ZodFunction extends ZodType {
  constructor() {
    super(...arguments);
    this.validate = this.implement;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.function) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.function,
        received: ctx.parsedType
      });
      return INVALID;
    }
    function makeArgsIssue(args, error) {
      return makeIssue({
        data: args,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_arguments,
          argumentsError: error
        }
      });
    }
    function makeReturnsIssue(returns, error) {
      return makeIssue({
        data: returns,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_return_type,
          returnTypeError: error
        }
      });
    }
    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn = ctx.data;
    if (this._def.returns instanceof ZodPromise) {
      const me = this;
      return OK(async function(...args) {
        const error = new ZodError([]);
        const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
          error.addIssue(makeArgsIssue(args, e));
          throw error;
        });
        const result = await Reflect.apply(fn, this, parsedArgs);
        const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
          error.addIssue(makeReturnsIssue(result, e));
          throw error;
        });
        return parsedReturns;
      });
    } else {
      const me = this;
      return OK(function(...args) {
        const parsedArgs = me._def.args.safeParse(args, params);
        if (!parsedArgs.success) {
          throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
        }
        const result = Reflect.apply(fn, this, parsedArgs.data);
        const parsedReturns = me._def.returns.safeParse(result, params);
        if (!parsedReturns.success) {
          throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
        }
        return parsedReturns.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...items) {
    return new _ZodFunction({
      ...this._def,
      args: ZodTuple.create(items).rest(ZodUnknown.create())
    });
  }
  returns(returnType) {
    return new _ZodFunction({
      ...this._def,
      returns: returnType
    });
  }
  implement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  strictImplement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  static create(args, returns, params) {
    return new _ZodFunction({
      args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
      returns: returns || ZodUnknown.create(),
      typeName: ZodFirstPartyTypeKind.ZodFunction,
      ...processCreateParams(params)
    });
  }
};
var ZodLazy = class extends ZodType {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
};
ZodLazy.create = (getter, params) => {
  return new ZodLazy({
    getter,
    typeName: ZodFirstPartyTypeKind.ZodLazy,
    ...processCreateParams(params)
  });
};
var ZodLiteral = class extends ZodType {
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_literal,
        expected: this._def.value
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
};
ZodLiteral.create = (value, params) => {
  return new ZodLiteral({
    value,
    typeName: ZodFirstPartyTypeKind.ZodLiteral,
    ...processCreateParams(params)
  });
};
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
var ZodEnum = class _ZodEnum extends ZodType {
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(this._def.values);
    }
    if (!this._cache.has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return _ZodEnum.create(values, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values, newDef = this._def) {
    return _ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
      ...this._def,
      ...newDef
    });
  }
};
ZodEnum.create = createZodEnum;
var ZodNativeEnum = class extends ZodType {
  _parse(input) {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(util.getValidEnumValues(this._def.values));
    }
    if (!this._cache.has(input.data)) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get enum() {
    return this._def.values;
  }
};
ZodNativeEnum.create = (values, params) => {
  return new ZodNativeEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
    ...processCreateParams(params)
  });
};
var ZodPromise = class extends ZodType {
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK(promisified.then((data) => {
      return this._def.type.parseAsync(data, {
        path: ctx.path,
        errorMap: ctx.common.contextualErrorMap
      });
    }));
  }
};
ZodPromise.create = (schema, params) => {
  return new ZodPromise({
    type: schema,
    typeName: ZodFirstPartyTypeKind.ZodPromise,
    ...processCreateParams(params)
  });
};
var ZodEffects = class extends ZodType {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: (arg) => {
        addIssueToContext(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      },
      get path() {
        return ctx.path;
      }
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID;
          const result = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        });
      } else {
        if (status.value === "aborted")
          return INVALID;
        const result = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        if (result.status === "aborted")
          return INVALID;
        if (result.status === "dirty")
          return DIRTY(result.value);
        if (status.value === "dirty")
          return DIRTY(result.value);
        return result;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = (acc) => {
        const result = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result);
        }
        if (result instanceof Promise) {
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        }
        return acc;
      };
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inner.status === "aborted")
          return INVALID;
        if (inner.status === "dirty")
          status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          return executeRefinement(inner.value).then(() => {
            return { status: status.value, value: inner.value };
          });
        });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid(base))
          return INVALID;
        const result = effect.transform(base.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
        }
        return { status: status.value, value: result };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
          if (!isValid(base))
            return INVALID;
          return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
            status: status.value,
            value: result
          }));
        });
      }
    }
    util.assertNever(effect);
  }
};
ZodEffects.create = (schema, effect, params) => {
  return new ZodEffects({
    schema,
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    effect,
    ...processCreateParams(params)
  });
};
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
  return new ZodEffects({
    schema,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    ...processCreateParams(params)
  });
};
var ZodOptional = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined) {
      return OK(void 0);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodOptional.create = (type, params) => {
  return new ZodOptional({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodOptional,
    ...processCreateParams(params)
  });
};
var ZodNullable = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.null) {
      return OK(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodNullable.create = (type, params) => {
  return new ZodNullable({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodNullable,
    ...processCreateParams(params)
  });
};
var ZodDefault = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
};
ZodDefault.create = (type, params) => {
  return new ZodDefault({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams(params)
  });
};
var ZodCatch = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    };
    const result = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    if (isAsync(result)) {
      return result.then((result2) => {
        return {
          status: "valid",
          value: result2.status === "valid" ? result2.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      });
    } else {
      return {
        status: "valid",
        value: result.status === "valid" ? result.value : this._def.catchValue({
          get error() {
            return new ZodError(newCtx.common.issues);
          },
          input: newCtx.data
        })
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
};
ZodCatch.create = (type, params) => {
  return new ZodCatch({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams(params)
  });
};
var ZodNaN = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
};
ZodNaN.create = (params) => {
  return new ZodNaN({
    typeName: ZodFirstPartyTypeKind.ZodNaN,
    ...processCreateParams(params)
  });
};
var BRAND = /* @__PURE__ */ Symbol("zod_brand");
var ZodBranded = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
};
var ZodPipeline = class _ZodPipeline extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      };
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      if (inResult.status === "aborted")
        return INVALID;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      }
    }
  }
  static create(a, b) {
    return new _ZodPipeline({
      in: a,
      out: b,
      typeName: ZodFirstPartyTypeKind.ZodPipeline
    });
  }
};
var ZodReadonly = class extends ZodType {
  _parse(input) {
    const result = this._def.innerType._parse(input);
    const freeze = (data) => {
      if (isValid(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    };
    return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodReadonly.create = (type, params) => {
  return new ZodReadonly({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodReadonly,
    ...processCreateParams(params)
  });
};
function cleanParams(params, data) {
  const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
function custom(check, _params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      const r = check(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          if (!r2) {
            const params = cleanParams(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
var late = {
  object: ZodObject.lazycreate
};
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind2) {
  ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
var instanceOfType = (cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom((data) => data instanceof cls, params);
var stringType = ZodString.create;
var numberType = ZodNumber.create;
var nanType = ZodNaN.create;
var bigIntType = ZodBigInt.create;
var booleanType = ZodBoolean.create;
var dateType = ZodDate.create;
var symbolType = ZodSymbol.create;
var undefinedType = ZodUndefined.create;
var nullType = ZodNull.create;
var anyType = ZodAny.create;
var unknownType = ZodUnknown.create;
var neverType = ZodNever.create;
var voidType = ZodVoid.create;
var arrayType = ZodArray.create;
var objectType = ZodObject.create;
var strictObjectType = ZodObject.strictCreate;
var unionType = ZodUnion.create;
var discriminatedUnionType = ZodDiscriminatedUnion.create;
var intersectionType = ZodIntersection.create;
var tupleType = ZodTuple.create;
var recordType = ZodRecord.create;
var mapType = ZodMap.create;
var setType = ZodSet.create;
var functionType = ZodFunction.create;
var lazyType = ZodLazy.create;
var literalType = ZodLiteral.create;
var enumType = ZodEnum.create;
var nativeEnumType = ZodNativeEnum.create;
var promiseType = ZodPromise.create;
var effectsType = ZodEffects.create;
var optionalType = ZodOptional.create;
var nullableType = ZodNullable.create;
var preprocessType = ZodEffects.createWithPreprocess;
var pipelineType = ZodPipeline.create;
var ostring = () => stringType().optional();
var onumber = () => numberType().optional();
var oboolean = () => booleanType().optional();
var coerce = {
  string: ((arg) => ZodString.create({ ...arg, coerce: true })),
  number: ((arg) => ZodNumber.create({ ...arg, coerce: true })),
  boolean: ((arg) => ZodBoolean.create({
    ...arg,
    coerce: true
  })),
  bigint: ((arg) => ZodBigInt.create({ ...arg, coerce: true })),
  date: ((arg) => ZodDate.create({ ...arg, coerce: true }))
};
var NEVER = INVALID;

// shared/explorersAppContract.ts
var text = (max) => external_exports.string().trim().max(max).refine((v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v) && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v), "Invalid text");
var appTitleSchema = text(1e3).refine((v) => v.length > 0 && Array.from(v).length <= 500 && !/[\u0000-\u001f\u007f]/.test(v), "Invalid title");
var safeAppUrlSchema = external_exports.string().max(2048).url().refine((v) => {
  try {
    const u = new URL(v);
    return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password && !u.port;
  } catch {
    return false;
  }
}, "Invalid URL");
var appPriceTierSchema = external_exports.enum(["Free", "Freemium", "Paid", "Subscription"]);
var fields = {
  appUrl: safeAppUrlSchema,
  developer: text(200).nullable(),
  logoUrl: safeAppUrlSchema.nullable(),
  description: text(8192).nullable(),
  downloadUrl: safeAppUrlSchema.nullable(),
  priceTier: appPriceTierSchema.nullable(),
  platforms: external_exports.array(text(100).refine((v) => v.length > 0, "Invalid platform")).max(16)
};
var appEntityDetailsSchema = external_exports.object(fields).strict().refine((v) => new TextEncoder().encode(JSON.stringify(v)).length <= 8192, "App details too large");
var { appUrl: _identity, ...overridable } = fields;
var appDisplayFieldsSchema = external_exports.object(overridable).partial().strict();
var appEntityDtoSchema = external_exports.object({ id: external_exports.string().uuid(), kind: external_exports.literal("app"), title: external_exports.string().trim().refine((v) => v.length > 0 && Array.from(v).length <= 500), details: appEntityDetailsSchema, origin: external_exports.literal("manual") }).strict();
var resolveManualAppSchema = external_exports.object({ kind: external_exports.literal("manual"), category: external_exports.literal("apps"), details: external_exports.object(fields).partial().extend({ title: appTitleSchema, appUrl: safeAppUrlSchema }).strict() }).strict();
var appScreenshotsSchema = external_exports.object({ screenshotMediaIds: external_exports.array(external_exports.string().uuid()).max(10) }).strict();

// shared/explorersTaxonomyContract.ts
var taxonomyCategorySchema = external_exports.enum(["places", "people"]);
var identity = external_exports.string().uuid().refine((v) => v === v.toLowerCase(), "Canonical lowercase UUID required");
var locale = external_exports.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/);
var text2 = (max) => external_exports.string().min(1).max(max).refine((v) => v.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(v) && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v), "Invalid text");
var slug = text2(100).refine((v) => v === v.trim() && !/[/?#\s]/.test(v), "Invalid slug");
var taxonomyTermSchema = external_exports.object({
  id: identity,
  category: taxonomyCategorySchema,
  slug,
  parentId: identity.nullable(),
  position: external_exports.number().int().nonnegative().safe(),
  active: external_exports.boolean(),
  labels: external_exports.record(locale, text2(200)).refine((v) => Object.keys(v).length > 0, "Missing labels")
}).strict();
var sourceMappingSchema = external_exports.object({
  sourceHost: external_exports.string().max(253).regex(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/),
  entityKind: text2(200),
  documentId: text2(500),
  termId: identity
}).strict();
var legacyMappingSchema = external_exports.object({ legacySlug: slug, termId: identity }).strict();
var taxonomyImportSchema = external_exports.object({
  version: external_exports.literal("explorers-taxonomy-import/v1"),
  catalogVersion: external_exports.number().int().positive().safe(),
  category: taxonomyCategorySchema,
  defaultLocale: locale,
  terms: external_exports.array(taxonomyTermSchema),
  sourceMappings: external_exports.array(sourceMappingSchema),
  legacySlugMappings: external_exports.array(legacyMappingSchema)
}).strict().superRefine((value, ctx) => {
  const reject = (message) => ctx.addIssue({ code: external_exports.ZodIssueCode.custom, message });
  const terms = /* @__PURE__ */ new Map();
  const slugs = /* @__PURE__ */ new Set();
  for (const term2 of value.terms) {
    if (terms.has(term2.id) || slugs.has(term2.slug)) reject("Duplicate term identity or slug");
    terms.set(term2.id, term2);
    slugs.add(term2.slug);
    if (term2.category !== value.category) reject("Category mismatch");
    if (!Object.prototype.hasOwnProperty.call(term2.labels, value.defaultLocale)) reject("Missing default label");
  }
  for (const term2 of value.terms) {
    if (term2.parentId === null) continue;
    const parent = terms.get(term2.parentId);
    if (value.category === "people" || !parent || parent.id === term2.id || parent.category !== term2.category || parent.parentId !== null)
      reject("Unsupported parent hierarchy");
  }
  const mappings = /* @__PURE__ */ new Set();
  for (const mapping of value.sourceMappings) {
    const key = JSON.stringify([mapping.sourceHost, mapping.entityKind, mapping.documentId]);
    if (mappings.has(key) || !terms.has(mapping.termId)) reject("Duplicate or dangling source mapping");
    mappings.add(key);
  }
  const aliases = /* @__PURE__ */ new Set();
  for (const mapping of value.legacySlugMappings) {
    if (aliases.has(mapping.legacySlug) || !terms.has(mapping.termId)) reject("Duplicate or dangling legacy mapping");
    if (slugs.has(mapping.legacySlug) && value.terms.find((t) => t.slug === mapping.legacySlug)?.id !== mapping.termId)
      reject("Legacy mapping conflicts with canonical slug");
    aliases.add(mapping.legacySlug);
  }
});
var placesTaxonomyAssignmentSchema = external_exports.object({ categoryTermId: identity.nullable(), subcategoryTermId: identity.nullable() }).strict().refine((v) => (v.categoryTermId !== null || v.subcategoryTermId === null) && (v.subcategoryTermId === null || v.categoryTermId !== v.subcategoryTermId), "Child requires distinct root");
var peopleSectorAssignmentSchema = identity.nullable();
var taxonomyCatalogQuerySchema = external_exports.object({ category: taxonomyCategorySchema, locale: locale.optional(), limit: external_exports.string().regex(/^(?:[1-9]|1[0-9]|2[0-4])$/).transform(Number).optional().default("24"), cursor: external_exports.string().min(1).max(4096).regex(/^[A-Za-z0-9_-]+$/).optional() }).strict();
var taxonomyCatalogItemSchema = external_exports.object({ id: identity, category: taxonomyCategorySchema, slug, parentId: identity.nullable(), position: external_exports.number().int().nonnegative().safe(), label: text2(200), resolvedLocale: locale }).strict();
var taxonomyCatalogPageSchema = external_exports.object({ version: external_exports.literal("explorers-taxonomy-catalog/v1"), category: taxonomyCategorySchema, state: external_exports.enum(["CONFIGURED", "UNCONFIGURED"]), catalogVersion: external_exports.number().int().nonnegative().safe(), requestedLocale: locale.nullable(), defaultLocale: locale.nullable(), items: external_exports.array(taxonomyCatalogItemSchema).max(24), nextCursor: external_exports.string().min(1).max(4096).nullable() }).strict().superRefine((v, c) => {
  if (v.state === "UNCONFIGURED" ? v.catalogVersion !== 0 || v.defaultLocale !== null || v.items.length !== 0 || v.nextCursor !== null : v.catalogVersion === 0 || v.defaultLocale === null) c.addIssue({ code: external_exports.ZodIssueCode.custom, message: "Invalid catalog state" });
  if (v.items.some((i) => i.category !== v.category || i.resolvedLocale !== v.defaultLocale && i.resolvedLocale !== v.requestedLocale)) c.addIssue({ code: external_exports.ZodIssueCode.custom, message: "Invalid catalog item" });
});
var taxonomySelectionReadSchema = external_exports.object({ id: identity, slug, label: text2(200).nullable(), unavailable: external_exports.boolean() }).strict();
var catalogRead = { catalogState: external_exports.enum(["CONFIGURED", "UNCONFIGURED"]), catalogVersion: external_exports.number().int().nonnegative().safe(), defaultLocale: locale.nullable() };
var placesTaxonomyReadSchema = external_exports.object({ ...catalogRead, category: taxonomySelectionReadSchema.nullable(), subcategory: taxonomySelectionReadSchema.nullable(), selectionUnavailable: external_exports.boolean() }).strict();
var peopleSectorReadSchema = external_exports.object({ ...catalogRead, sector: taxonomySelectionReadSchema.nullable(), selectionUnavailable: external_exports.boolean() }).strict();

// shared/explorersGameContract.ts
var text3 = (max) => external_exports.string().max(max).refine((v) => !/[\u0000-\u001f\u007f]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v));
var name = text3(200).refine((v) => v.trim().length > 0);
var positive = external_exports.number().int().positive().safe();
var unix = external_exports.number().int().min(0).max(253402300799);
var gameExternalIdSchema = external_exports.string().regex(/^[1-9]\d{0,15}$/).refine((v) => Number.isSafeInteger(Number(v)));
var gameSearchInputSchema = external_exports.object({ query: text3(200).transform((v) => v.trim()).refine((v) => v.length > 0), limit: external_exports.literal(24), cursor: external_exports.string().regex(/^[A-Za-z0-9_-]{1,512}$/).optional() }).strict();
var term = external_exports.object({ id: positive, name }).strict();
var imageId = external_exports.string().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/);
var dateFormat = external_exports.object({ id: positive, format: name }).strict();
var releaseRegion = external_exports.object({ id: positive, region: name }).strict();
var release = external_exports.object({ id: positive, date: unix.nullish(), y: external_exports.number().int().min(1).max(9999).nullish(), m: external_exports.number().int().min(1).max(12).nullish(), d: external_exports.number().int().min(1).max(31).nullish(), human: text3(200).nullish(), platform: positive.nullish(), date_format: dateFormat.nullish(), release_region: releaseRegion.nullish(), category: external_exports.number().int().min(0).max(7).nullish(), region: external_exports.number().int().min(1).max(10).nullish() }).strict();
var company = external_exports.object({ id: positive, developer: external_exports.boolean(), publisher: external_exports.boolean(), company: term }).strict();
var gameUrl = external_exports.string().max(2048).url().refine((v) => {
  const u = new URL(v);
  return !/[\u0000-\u001f\u007f]/.test(v) && u.protocol === "https:" && u.hostname === "www.igdb.com" && !u.port && !u.username && !u.password && !u.search && !u.hash && /^\/games\/[a-z0-9-]+$/.test(u.pathname);
});
var gameProviderRowSchema = external_exports.object({ id: positive, name, slug: text3(200).nullish(), cover: external_exports.object({ image_id: imageId }).strict().nullish(), summary: text3(1e5).nullish(), storyline: text3(1e5).nullish(), first_release_date: unix.nullish(), total_rating: external_exports.number().finite().min(0).max(100).nullish(), total_rating_count: external_exports.number().int().nonnegative().safe().nullish(), genres: external_exports.array(term).max(128).nullish(), platforms: external_exports.array(term).max(256).nullish(), game_modes: external_exports.array(term).max(32).nullish(), involved_companies: external_exports.array(company).max(100).nullish(), screenshots: external_exports.array(external_exports.object({ image_id: imageId }).strict()).max(100).nullish(), url: gameUrl.nullish(), release_dates: external_exports.array(release).max(128).nullish() }).strict();

// shared/explorersMovieContract.ts
var text4 = (n) => external_exports.string().trim().max(n).refine((v) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v) && !/[\u0000-\u001f\u007f]/.test(v));
var id = external_exports.number().int().positive().safe();
var url = external_exports.string().max(2048).url().refine((v) => {
  const u = new URL(v);
  return u.protocol === "https:" && !u.username && !u.password && !u.port;
});
var image = url.refine((v) => new URL(v).hostname === "image.tmdb.org");
var movieGenreSchema = external_exports.object({ providerGenreId: id, name: text4(200).refine((v) => v.length > 0) }).strict();
var offer = external_exports.object({ providerId: id, name: text4(200).refine((v) => v.length > 0), logoUrl: image.nullable(), priority: external_exports.number().int().nonnegative().safe() }).strict();
var region = external_exports.object({ link: url.nullable(), flatrate: external_exports.array(offer).max(64), rent: external_exports.array(offer).max(64), buy: external_exports.array(offer).max(64) }).strict();
var movieWatchSchema = external_exports.record(external_exports.string().regex(/^[A-Z]{2}$/), region).refine((v) => Object.keys(v).length <= 32);
var movieContextSchema = external_exports.object({ region: external_exports.string().regex(/^[A-Z]{2}$/).default("US"), selectedProviderIds: external_exports.array(id).max(8).refine((v) => new Set(v).size === v.length).nullable() }).strict();
var movieDetailsSchema = external_exports.object({ mediaType: external_exports.enum(["movie", "tv"]), originalTitle: text4(1e3).nullable(), yearText: text4(100).nullable(), posterUrl: image.nullable(), backdropUrl: image.nullable(), genres: external_exports.array(movieGenreSchema).max(32).refine((v) => new Set(v.map((x) => x.providerGenreId)).size === v.length), director: text4(1e3).nullable(), runtimeMinutes: external_exports.number().int().nonnegative().max(2147483647).nullable(), providerRating: external_exports.number().min(0).max(10).nullable(), overview: text4(1e5).nullable(), seasonCount: external_exports.number().int().nonnegative().max(2147483647).nullable(), watchProviders: movieWatchSchema, cast: external_exports.array(external_exports.object({ personId: id, creditId: text4(200).refine((v) => v.length > 0), name: text4(1e3).refine((v) => v.length > 0), character: text4(1e3), profileUrl: image.nullable(), order: external_exports.number().int().nonnegative().safe() }).strict()).max(200) }).strict().refine((v) => v.mediaType === "tv" || v.seasonCount === null);
var movieSearchRequestSchema = external_exports.object({ query: text4(200).refine((v) => v.length > 0), mediaType: external_exports.enum(["movie", "tv"]).optional(), limit: external_exports.union([external_exports.number().int(), external_exports.string().regex(/^[1-9]\d?$/).transform(Number)]).pipe(external_exports.number().min(1).max(24)).default(24), cursor: external_exports.string().regex(/^[A-Za-z0-9_-]{32}$/).optional() }).strict();
var movieCandidateSchema = external_exports.object({ provider: external_exports.literal("tmdb"), externalKind: external_exports.enum(["movie", "tv"]), externalId: external_exports.string().regex(/^[1-9]\d{0,15}$/).refine((v) => Number.isSafeInteger(Number(v))), title: text4(1e3).refine((v) => v.length > 0), posterUrl: image.nullable(), yearText: text4(100).nullable() }).strict();
var movieEntityDtoSchema = external_exports.object({ id: external_exports.string().uuid(), kind: external_exports.literal("movie"), title: text4(500).refine((v) => v.length > 0), origin: external_exports.enum(["manual", "provider"]), details: movieDetailsSchema, provenance: external_exports.object({ provider: external_exports.literal("tmdb"), externalKind: external_exports.enum(["movie", "tv"]), externalId: movieCandidateSchema.shape.externalId, fetchedAt: external_exports.number().int().nonnegative().safe(), sourceUrl: url, mappingVersion: external_exports.literal(1) }).strict().nullable() }).strict().refine((v) => v.origin === "manual" ? v.provenance === null : !!v.provenance && v.provenance.externalKind === v.details.mediaType && v.provenance.sourceUrl === `https://api.themoviedb.org/3/${v.details.mediaType}/${v.provenance.externalId}`);
var resolveProviderMovieSchema = external_exports.object({ kind: external_exports.literal("provider"), category: external_exports.literal("movies"), provider: external_exports.literal("tmdb"), externalKind: external_exports.enum(["movie", "tv"]), externalId: movieCandidateSchema.shape.externalId }).strict();
var movieDisplayFieldsSchema = external_exports.object({ originalTitle: text4(1e3).nullable().optional(), yearText: text4(100).nullable().optional(), director: text4(1e3).nullable().optional(), runtimeMinutes: external_exports.number().int().nonnegative().max(2147483647).nullable().optional(), overview: text4(1e5).nullable().optional(), seasonCount: external_exports.number().int().nonnegative().max(2147483647).nullable().optional() }).strict();
var movieCandidatesSchema = external_exports.object({ version: external_exports.literal("explorers-movie-candidates/v1"), items: external_exports.array(movieCandidateSchema).max(24), nextCursor: external_exports.string().regex(/^[A-Za-z0-9_-]{32}$/).nullable(), expiresAt: external_exports.number().int().positive().safe() }).strict();
var movieTermSchema = external_exports.object({ id: external_exports.string().uuid(), category: external_exports.literal("movies"), slug: text4(100).refine((v) => v.length > 0), label: text4(200).refine((v) => v.length > 0), position: external_exports.number().int().min(0).max(31) }).strict();
var movieTermsSchema = external_exports.array(movieTermSchema).max(32).refine((v) => new Set(v.map((x) => x.id)).size === v.length && v.every((x, i) => x.position === i));
var resolveManualMovieSchema = external_exports.object({ kind: external_exports.literal("manual"), category: external_exports.literal("movies"), details: movieDisplayFieldsSchema.extend({ title: text4(500).refine((v) => v.length > 0), mediaType: external_exports.enum(["movie", "tv"]).default("movie"), providerRating: external_exports.number().min(0).max(10).nullable().optional() }).strict() }).strict().refine((v) => v.details.mediaType === "tv" || v.details.seasonCount == null);

// shared/explorersRichNoteContract.ts
var RICH_NOTE_BYTES = 256 * 1024;
var richNoteSchema = external_exports.object({ version: external_exports.literal(1), format: external_exports.literal("quill-html"), html: external_exports.string().refine((html) => new TextEncoder().encode(html).byteLength <= RICH_NOTE_BYTES, "Rich note exceeds byte limit") }).strict();

// shared/explorersBookContract.ts
var text5 = (max) => external_exports.string().trim().max(max).refine((v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v) && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v), "Invalid text");
var bookTitleSchema = text5(1e3).refine((v) => v.length > 0 && Array.from(v).length <= 500 && !/[\u0000-\u001f\u007f]/.test(v), "Invalid title");
var safeBookUrlSchema = external_exports.string().max(2048).url().refine((v) => {
  try {
    const u = new URL(v);
    return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password && !u.port;
  } catch {
    return false;
  }
}, "Invalid URL");
var metadataUrl = safeBookUrlSchema.refine((v) => new URL(v).hostname === "books.google.com" && new URL(v).protocol === "https:", "Unapproved Book metadata URL");
var members = external_exports.array(text5(1e3)).max(200);
var fields2 = { subtitle: text5(1e3).nullable(), publisher: text5(1e3).nullable(), publishedDateText: text5(100).nullable(), yearText: text5(100).nullable(), description: text5(1e5).nullable(), coverUrl: metadataUrl.nullable(), coverLargeUrl: metadataUrl.nullable(), pageCount: external_exports.number().int().nonnegative().max(2147483647).nullable(), isbn13: external_exports.string().regex(/^\d{13}$/).nullable(), isbn10: external_exports.string().regex(/^\d{9}[\dX]$/).nullable(), providerRating: external_exports.number().min(0).max(5).nullable(), ratingsCount: external_exports.number().int().nonnegative().max(2147483647).nullable(), languageTag: text5(100).nullable(), previewLink: metadataUrl.nullable(), authors: members, subjects: members };
var bookEntityDetailsSchema = external_exports.object(fields2).strict().refine((v) => new TextEncoder().encode(JSON.stringify(v)).length <= 1024 * 1024, "Book details too large");
var { providerRating: _rating, ratingsCount: _count, ...editable } = fields2;
var bookDisplayFieldsSchema = external_exports.object(editable).partial().strict();
var bookRecommendationContextSchema = external_exports.object({ buyLinks: external_exports.array(external_exports.object({ name: text5(200).refine((v) => v.length > 0), url: safeBookUrlSchema, logo: safeBookUrlSchema.optional() }).strict()).max(20) }).strict();
var bookExternalIdSchema = external_exports.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
var bookProvenanceSchema = external_exports.object({ provider: external_exports.literal("google_books"), externalKind: external_exports.literal("volume"), externalId: bookExternalIdSchema, fetchedAt: external_exports.number().int().nonnegative().safe(), sourceUrl: external_exports.string().max(2048).refine((v) => /^https:\/\/www\.googleapis\.com\/books\/v1\/volumes\/[A-Za-z0-9_-]+$/.test(v)), mappingVersion: external_exports.literal(1) }).strict().refine((v) => v.sourceUrl === `https://www.googleapis.com/books/v1/volumes/${v.externalId}`, "Inconsistent Book provenance");
var bookCandidateSchema = external_exports.object({ provider: external_exports.literal("google_books"), externalKind: external_exports.literal("volume"), externalId: bookExternalIdSchema, title: bookTitleSchema, preview: bookEntityDetailsSchema, provenance: bookProvenanceSchema, buyLinkSuggestion: safeBookUrlSchema.nullable() }).strict().refine((v) => v.externalId === v.provenance.externalId, "Inconsistent Book identity");
var bookCandidatesSchema = external_exports.object({ version: external_exports.literal("explorers-book-candidates/v1"), items: external_exports.array(bookCandidateSchema).max(20), nextCursor: external_exports.string().max(4096).nullable(), expiresAt: external_exports.number().int().positive().safe() }).strict();
var bookCandidateRequestSchema = external_exports.object({ query: external_exports.string().trim().refine((v) => Array.from(v).length >= 1 && Array.from(v).length <= 200 && new TextEncoder().encode(v).length <= 800 && !/[\u0000-\u001f\u007f]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v)), limit: external_exports.union([external_exports.number().int(), external_exports.string().regex(/^[1-9]\d?$/).transform(Number)]).pipe(external_exports.number().min(1).max(20)).default(12), cursor: external_exports.string().min(1).max(4096).optional() }).strict();
var bookEntityDtoSchema = external_exports.object({ id: external_exports.string().uuid(), kind: external_exports.literal("book"), title: external_exports.string().trim().refine((v) => v.length > 0 && Array.from(v).length <= 500), details: bookEntityDetailsSchema, provenance: bookProvenanceSchema.nullable(), origin: external_exports.enum(["manual", "provider"]) }).strict();
var resolveProviderBookSchema = external_exports.object({ kind: external_exports.literal("provider"), category: external_exports.literal("books"), provider: external_exports.literal("google_books"), externalKind: external_exports.literal("volume"), externalId: bookExternalIdSchema }).strict();
var resolveManualBookSchema = external_exports.object({ kind: external_exports.literal("manual"), category: external_exports.literal("books"), details: external_exports.object(editable).partial().extend({ title: bookTitleSchema }).strict() }).strict();
var replaceRecommendationEntitySchema = external_exports.object({ expectedRevision: external_exports.number().int().positive().safe(), entityId: external_exports.string().uuid() }).strict();

// shared/currency.ts
var ZERO = ["BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"];
var THREE = ["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"];
var TWO = [
  "AED",
  "AFN",
  "ALL",
  "AMD",
  "AOA",
  "ARS",
  "AUD",
  "AWG",
  "AZN",
  "BAM",
  "BBD",
  "BDT",
  "BMD",
  "BND",
  "BOB",
  "BRL",
  "BSD",
  "BTN",
  "BWP",
  "BYN",
  "BZD",
  "CAD",
  "CDF",
  "CHF",
  "CNY",
  "COP",
  "CRC",
  "CUP",
  "CVE",
  "CZK",
  "DKK",
  "DOP",
  "DZD",
  "EGP",
  "ERN",
  "ETB",
  "EUR",
  "FJD",
  "FKP",
  "GBP",
  "GEL",
  "GHS",
  "GIP",
  "GMD",
  "GTQ",
  "GYD",
  "HKD",
  "HNL",
  "HTG",
  "HUF",
  "IDR",
  "ILS",
  "INR",
  "IRR",
  "JMD",
  "KES",
  "KGS",
  "KHR",
  "KPW",
  "KYD",
  "KZT",
  "LAK",
  "LBP",
  "LKR",
  "LRD",
  "LSL",
  "MAD",
  "MDL",
  "MGA",
  "MKD",
  "MMK",
  "MNT",
  "MOP",
  "MRU",
  "MUR",
  "MVR",
  "MWK",
  "MXN",
  "MYR",
  "MZN",
  "NAD",
  "NGN",
  "NIO",
  "NOK",
  "NPR",
  "NZD",
  "PAB",
  "PEN",
  "PGK",
  "PHP",
  "PKR",
  "PLN",
  "QAR",
  "RON",
  "RSD",
  "RUB",
  "SAR",
  "SBD",
  "SCR",
  "SDG",
  "SEK",
  "SGD",
  "SHP",
  "SLE",
  "SOS",
  "SRD",
  "SSP",
  "STN",
  "SVC",
  "SYP",
  "SZL",
  "THB",
  "TJS",
  "TMT",
  "TOP",
  "TRY",
  "TTD",
  "TWD",
  "TZS",
  "UAH",
  "USD",
  "UYU",
  "UZS",
  "VED",
  "VES",
  "WST",
  "XCD",
  "XCG",
  "YER",
  "ZAR",
  "ZMW",
  "ZWG"
];
var build = (groups) => {
  const table = {};
  for (const [digits, codes] of groups) for (const code of codes) table[code] = digits;
  return Object.freeze(table);
};
var CURRENCY_MINOR_UNITS = build([[0, ZERO], [2, TWO], [3, THREE]]);
var RETIRED_CURRENCY_MINOR_UNITS = build([[2, ["ANG", "BGN", "CUC", "HRK", "MRO", "SLL", "STD", "VEF", "ZWL"]], [0, ["BYR"]]]);
var CURRENCY_CODES = Object.freeze(Object.keys(CURRENCY_MINOR_UNITS).sort());
var has = (table, code) => Object.prototype.hasOwnProperty.call(table, code);
var isActiveCurrency = (code) => typeof code === "string" && has(CURRENCY_MINOR_UNITS, code);
var isKnownCurrency = (code) => isActiveCurrency(code) || typeof code === "string" && has(RETIRED_CURRENCY_MINOR_UNITS, code);
var minorUnitsOf = (code) => has(CURRENCY_MINOR_UNITS, code) ? CURRENCY_MINOR_UNITS[code] : has(RETIRED_CURRENCY_MINOR_UNITS, code) ? RETIRED_CURRENCY_MINOR_UNITS[code] : void 0;
var decimalScale = (amount) => {
  const at = amount.indexOf(".");
  return at < 0 ? 0 : amount.length - at - 1;
};
function amountPrecisionProblem(amount, code) {
  const units = minorUnitsOf(code);
  if (units === void 0 || decimalScale(amount) <= units) return null;
  return units === 0 ? `${code} has no decimal places; enter a whole amount.` : `${code} allows at most ${units} decimal place${units === 1 ? "" : "s"}.`;
}

// shared/explorersProductContract.ts
var text6 = (max) => external_exports.string().trim().max(max).refine((v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v) && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v), "Invalid text");
var productTitleSchema = text6(1e3).refine((v) => v.length > 0 && Array.from(v).length <= 500 && !/[\u0000-\u001f\u007f]/.test(v), "Invalid title");
var safeProductUrlSchema = external_exports.string().max(2048).url().refine((v) => {
  try {
    const u = new URL(v);
    return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password && !u.port;
  } catch {
    return false;
  }
}, "Invalid URL");
var currencyCodeSchema = external_exports.string().refine(isKnownCurrency, "Unsupported currency code");
var storedCurrencyCodeSchema = external_exports.string().regex(/^[A-Z]{3}$/, "Invalid currency code");
var productAmountSchema = external_exports.string().regex(/^(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,6})?$/, "Invalid amount");
var precision = (value, ctx) => {
  const problem = value.price !== null && value.currencyCode !== null ? amountPrecisionProblem(value.price, value.currencyCode) : null;
  if (problem) ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["price"], message: problem });
};
var productOfferSchema = external_exports.object({
  price: productAmountSchema.nullable(),
  currencyCode: storedCurrencyCodeSchema.nullable(),
  buyUrl: safeProductUrlSchema.nullable()
}).strict().superRefine(precision);
var productOfferWriteSchema = external_exports.object({
  price: productAmountSchema.nullable(),
  currencyCode: currencyCodeSchema.nullable(),
  buyUrl: safeProductUrlSchema.nullable()
}).strict().superRefine((value, ctx) => {
  if (value.price !== null && value.currencyCode === null) ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["currencyCode"], message: "Choose a currency for the price" });
  if (value.price === null && value.currencyCode !== null) ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["price"], message: "Enter a price for the currency, or clear the currency" });
  precision(value, ctx);
});
var productSpecificationsSchema = external_exports.record(text6(200).refine((v) => v.length > 0, "Invalid key"), text6(2e3).refine((v) => v.length > 0, "Invalid value")).refine((v) => Object.keys(v).length <= 200, "Too many specifications");
var fields3 = {
  productUrl: safeProductUrlSchema,
  brand: text6(200).nullable(),
  logoUrl: safeProductUrlSchema.nullable(),
  description: text6(8192).nullable(),
  specifications: productSpecificationsSchema,
  imageUrls: external_exports.array(safeProductUrlSchema).max(20)
};
var productEntityDetailsSchema = external_exports.object(fields3).strict().refine((v) => new TextEncoder().encode(JSON.stringify(v)).length <= 16384, "Product details too large");
var { productUrl: _identity2, ...overridable2 } = fields3;
var productDisplayFieldsSchema = external_exports.object(overridable2).partial().strict();
var productEntityDtoSchema = external_exports.object({ id: external_exports.string().uuid(), kind: external_exports.literal("product"), title: external_exports.string().trim().refine((v) => v.length > 0 && Array.from(v).length <= 500), details: productEntityDetailsSchema, origin: external_exports.literal("manual") }).strict();
var resolveManualProductSchema = external_exports.object({ kind: external_exports.literal("manual"), category: external_exports.literal("products"), details: external_exports.object(fields3).partial().extend({ title: productTitleSchema, productUrl: safeProductUrlSchema }).strict() }).strict();

// shared/explorersPersonContract.ts
var text7 = (max) => external_exports.string().trim().max(max).refine((v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v) && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v), "Invalid text");
var personNameSchema = text7(1e3).refine((v) => v.length > 0 && Array.from(v).length <= 500 && !/[\u0000-\u001f\u007f]/.test(v), "Invalid name");
var safePersonUrlSchema = external_exports.string().max(2048).url().refine((v) => {
  try {
    const u = new URL(v);
    return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password && !u.port;
  } catch {
    return false;
  }
}, "Invalid URL");
var PERSON_PLATFORMS = ["instagram", "linkedin", "twitter", "github", "youtube", "website", "other"];
var personPlatformSchema = external_exports.enum(PERSON_PLATFORMS);
var PERSON_SOCIAL_KEYS = ["primary", ...PERSON_PLATFORMS];
var personSocialUrlsSchema = external_exports.object(Object.fromEntries(PERSON_SOCIAL_KEYS.map((key) => [key, safePersonUrlSchema.optional()]))).strict();
var fields4 = {
  usernameHandle: text7(200).nullable(),
  headline: text7(500).nullable(),
  locationText: text7(200).nullable(),
  avatarUrl: safePersonUrlSchema.nullable(),
  primaryPlatform: personPlatformSchema.nullable(),
  socialUrls: personSocialUrlsSchema,
  skillsTags: external_exports.array(text7(100).refine((v) => v.length > 0, "Invalid tag")).max(32),
  // Presentation metadata only. No Explorers follower relationship is created or implied,
  // which is why this is free text and not a number to be summed or compared.
  externalFollowerCountText: text7(50).nullable()
};
var personEntityDetailsSchema = external_exports.object(fields4).strict().refine((v) => new TextEncoder().encode(JSON.stringify(v)).length <= 8192, "Person details too large");
var { usernameHandle: _identity3, ...overridable3 } = fields4;
var personDisplayFieldsSchema = external_exports.object(overridable3).partial().strict();
var personEntityDtoSchema = external_exports.object({ id: external_exports.string().uuid(), kind: external_exports.literal("person"), title: external_exports.string().trim().refine((v) => v.length > 0 && Array.from(v).length <= 500), details: personEntityDetailsSchema, origin: external_exports.literal("manual"), suppressed: external_exports.boolean() }).strict();
var resolveManualPersonSchema = external_exports.object({ kind: external_exports.literal("manual"), category: external_exports.literal("people"), details: external_exports.object(fields4).partial().extend({ title: personNameSchema }).strict() }).strict();

// shared/explorersPlaceContract.ts
var text8 = (max) => external_exports.string().trim().max(max).refine((v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v) && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v), "Invalid text");
var placeTitleSchema = text8(1e3).refine((v) => v.length > 0 && Array.from(v).length <= 500 && !/[\u0000-\u001f\u007f]/.test(v), "Invalid title");
var safePlaceUrlSchema = external_exports.string().max(2048).url().refine((v) => {
  try {
    const u = new URL(v);
    return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password && !u.port;
  } catch {
    return false;
  }
}, "Invalid URL");
var coordinate = (max) => external_exports.number().refine(Number.isFinite, "Invalid coordinate").refine((v) => Math.abs(v) <= max, "Coordinate out of range").refine((v) => Number.isInteger(Math.round(v * 1e7)) && Math.abs(v * 1e7 - Math.round(v * 1e7)) < 1e-6, "Coordinate exceeds stored precision");
var placeAddressComponentSchema = external_exports.object({
  longText: text8(500).nullable(),
  shortText: text8(200).nullable(),
  types: external_exports.array(text8(100).refine((v) => v.length > 0, "Invalid type")).max(16)
}).strict();
var entityFields = {
  formattedAddress: text8(1e3).nullable(),
  addressComponents: external_exports.array(placeAddressComponentSchema).max(32),
  latitude: coordinate(90).nullable(),
  longitude: coordinate(180).nullable(),
  providerTypes: external_exports.array(text8(100).refine((v) => v.length > 0, "Invalid type")).max(32),
  providerRating: external_exports.number().min(0).max(5).nullable(),
  ratingsCount: external_exports.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
  // An approved public fact from the provider. A creator's own number lives in their
  // recommendation context and never reaches this column.
  publicPhone: text8(50).nullable(),
  websiteUrl: safePlaceUrlSchema.nullable(),
  priceLevel: external_exports.number().int().min(0).max(4).nullable(),
  priceRange: external_exports.union([external_exports.record(external_exports.unknown()), external_exports.string().max(200)]).nullable()
};
var placeEntityDetailsSchema = external_exports.object(entityFields).strict().refine((v) => v.latitude === null === (v.longitude === null), { message: "Coordinates must both be present or both absent", path: ["latitude"] }).refine((v) => new TextEncoder().encode(JSON.stringify(v)).length <= 16384, "Place details too large");
var {
  latitude: _lat,
  longitude: _lng,
  formattedAddress: _address,
  addressComponents: _components,
  providerRating: _rating2,
  ratingsCount: _count2,
  providerTypes: _types,
  ...overridable4
} = entityFields;
var placeDisplayFieldsSchema = external_exports.object(overridable4).partial().strict();
var PLACE_RECOMMENDATION_TYPES = ["place", "person"];
var PLACE_RECOMMENDATION_SOURCES = ["self", "suggestion"];
var PLACE_CONTACT_VISIBILITY = ["private", "public"];
var contextFields = {
  recommendationType: external_exports.enum(PLACE_RECOMMENDATION_TYPES),
  sourceOfRecommendation: external_exports.enum(PLACE_RECOMMENDATION_SOURCES),
  contactName: text8(200).nullable(),
  contactNumber: text8(50).nullable(),
  // Private unless the creator chose otherwise. Fresh rows are private, and the adapter
  // must carry an existing selection forward explicitly rather than re-defaulting it.
  contactVisibility: external_exports.enum(PLACE_CONTACT_VISIBILITY),
  placeSocialUrl: safePlaceUrlSchema.nullable(),
  placeWebsiteUrl: safePlaceUrlSchema.nullable(),
  creatorSocialUrl: safePlaceUrlSchema.nullable(),
  // Legacy Users_Place_Note, distinct from the core note while both are still consumed.
  legacyPlaceNote: external_exports.union([external_exports.record(external_exports.unknown()), external_exports.array(external_exports.unknown())]).nullable(),
  personProfileUrl: safePlaceUrlSchema.nullable(),
  personAddress: text8(1e3).nullable()
};
var placeRecommendationContextSchema = external_exports.object(contextFields).strict().superRefine((value, ctx) => {
  if (value.recommendationType !== "person" && (value.personProfileUrl !== null || value.personAddress !== null))
    ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["recommendationType"], message: "Person fields require a person recommendation" });
});
var placePhotosSchema = external_exports.object({ photoMediaIds: external_exports.array(external_exports.string().uuid()).max(10) }).strict();
var placeLocationSnapshotSchema = external_exports.object({
  version: external_exports.literal(1),
  name: text8(500).nullable(),
  address: text8(1e3).nullable(),
  providerPlaceId: text8(200).nullable(),
  latitude: coordinate(90).nullable(),
  longitude: coordinate(180).nullable()
}).strict().refine((v) => v.latitude === null === (v.longitude === null), { message: "Snapshot coordinates must both be present or both absent", path: ["latitude"] });
var placeCollectionDetailsSchema = external_exports.object({
  locationEntityId: external_exports.string().uuid().nullable(),
  locationSnapshot: placeLocationSnapshotSchema.nullable(),
  instagramMediaUrl: safePlaceUrlSchema.nullable()
}).strict();
var placeEntityDtoSchema = external_exports.object({ id: external_exports.string().uuid(), kind: external_exports.literal("place"), title: external_exports.string().trim().refine((v) => v.length > 0 && Array.from(v).length <= 500), details: placeEntityDetailsSchema, origin: external_exports.enum(["manual", "provider"]), providerPlaceId: external_exports.string().min(1).max(200).nullable() }).strict();
var resolveManualPlaceSchema = external_exports.object({ kind: external_exports.literal("manual"), category: external_exports.literal("places"), details: external_exports.object(entityFields).partial().extend({ title: placeTitleSchema }).strict() }).strict();

// shared/explorersContract.ts
var categoryKeys = [
  "places",
  "guides",
  "movies",
  "books",
  "games",
  "apps",
  "products",
  "people"
];
var retiredCategoryKeySchema = external_exports.enum([...categoryKeys, "music"]);
var categoryKeySchema = external_exports.enum(categoryKeys);
var analyticsInstant = external_exports.string().datetime({ offset: true }).refine((value) => Number.isFinite(Date.parse(value)));
var analyticsQuerySchema = external_exports.object({ from: analyticsInstant, to: analyticsInstant, category: categoryKeySchema.optional(), collectionId: external_exports.string().uuid().optional(), recommendationId: external_exports.string().uuid().optional() }).strict().refine((input) => Date.parse(input.to) > Date.parse(input.from) && Date.parse(input.to) - Date.parse(input.from) <= 366 * 864e5);
var contentCategorySchema = external_exports.enum(["places", "guides", "movies", "books", "games", "apps", "products", "people"]);
var recommendationCategorySchema = external_exports.enum(["places", "movies", "books", "games", "apps", "products", "people"]);
var catalogKindSchema = external_exports.enum(["place", "movie", "book", "game", "app", "product", "person"]);
var contentRevision = external_exports.number().int().positive().safe();
var contentTitle = external_exports.string().trim().min(1).max(200);
var contentSlug = external_exports.string().max(200).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
var accountLocale = external_exports.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/);
var publicationState = external_exports.enum(["draft", "published"]);
var contentVisibility = external_exports.enum(["private", "public"]);
var userRating = external_exports.number().int().min(1).max(10).nullable();
var contentIdSchema = external_exports.string().uuid();
var commandKeySchema = external_exports.string().regex(/^[A-Za-z0-9._~-]{8,200}$/);
var topPickCategorySchema = external_exports.enum(["books", "movies", "games", "apps", "products", "people"]);
var categoryContentRevisionSchema = external_exports.string().regex(/^(0|[1-9][0-9]{0,15})$/).refine((v) => Number.isSafeInteger(Number(v)));
var topPickMembershipSchema = external_exports.object({ recommendationId: contentIdSchema.transform((v) => v.toLowerCase()), collectionId: contentIdSchema.transform((v) => v.toLowerCase()) }).strict();
var categoryTopPicksInputSchema = external_exports.object({
  expectedCategoryRevision: categoryContentRevisionSchema,
  expectedPinRevision: contentRevision.nullable(),
  orderedPins: external_exports.array(topPickMembershipSchema).max(15).refine((pins) => new Set(pins.map((p) => p.recommendationId)).size === pins.length, "Duplicate recommendation")
}).strict();
var categoryTopPicksResultSchema = external_exports.object({
  operation: external_exports.enum(["replace", "upsert-order"]),
  categoryRevision: categoryContentRevisionSchema,
  pinRevision: contentRevision,
  pins: external_exports.array(topPickMembershipSchema.extend({ position: external_exports.number().int().nonnegative() })).max(15)
}).strict();
var collectionPlainText = external_exports.string().max(5e3).nullable();
var collectionHeading = external_exports.string().trim().max(200).nullable();
var recommendationMediaIds = external_exports.array(contentIdSchema).max(20).refine((ids) => new Set(ids).size === ids.length, "Duplicate media");
var catalogTitleSchema = external_exports.string().trim().refine((v) => v.length > 0 && Array.from(v).length <= 500, "Invalid title length");
var displayTitleWriteSchema = external_exports.string().trim().pipe(catalogTitleSchema).refine((v) => !/[\u0000-\u001f\u007f]/.test(v) && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v), "Invalid title characters");
var displayOverridesSchema = bookDisplayFieldsSchema.extend(movieDisplayFieldsSchema.shape).extend(appDisplayFieldsSchema.shape).extend(productDisplayFieldsSchema.shape).extend(personDisplayFieldsSchema.shape).extend(placeDisplayFieldsSchema.shape).extend({ title: displayTitleWriteSchema.nullable().optional() }).strict();
var displayOverridesReadSchema = bookDisplayFieldsSchema.extend(movieDisplayFieldsSchema.shape).extend(appDisplayFieldsSchema.shape).extend(productDisplayFieldsSchema.shape).extend(personDisplayFieldsSchema.shape).extend(placeDisplayFieldsSchema.shape).extend({ title: external_exports.string().refine((v) => v === v.trim(), "Unnormalized stored title").pipe(displayTitleWriteSchema).nullable().optional() }).strict();
var contentRevisionSchema = external_exports.object({ expectedRevision: contentRevision }).strict();
var createCollectionSchema = external_exports.object({
  category: contentCategorySchema,
  title: contentTitle,
  slug: contentSlug,
  visibility: contentVisibility.default("private"),
  publicationState: publicationState.default("draft"),
  description: collectionPlainText.default(null),
  heading: collectionHeading.default(null),
  coverMediaId: contentIdSchema.nullable().default(null),
  // The list's own location selection, for Places only: a location list is distinct
  // from the place recommendations inside it.
  placeLocation: placeCollectionDetailsSchema.optional(),
  // Ticket 5.2. Creating a Products or People list from a location links it atomically,
  // so a failed parent leaves no orphan child.
  parentLocationCollectionId: contentIdSchema.optional(),
  parentExpectedRevision: contentRevision.optional()
}).strict().refine((v) => v.parentLocationCollectionId === void 0 === (v.parentExpectedRevision === void 0), "Parent identity and revision are required together").refine((v) => v.placeLocation === void 0 || v.category === "places", "A location aggregate requires the places category").refine((v) => v.parentLocationCollectionId === void 0 || v.category === "products" || v.category === "people", "Only Products and People lists link to a location");
var updateCollectionSchema = external_exports.object({
  expectedRevision: contentRevision,
  title: contentTitle.optional(),
  slug: contentSlug.optional(),
  visibility: contentVisibility.optional(),
  publicationState: publicationState.optional(),
  description: collectionPlainText.optional(),
  heading: collectionHeading.optional(),
  coverMediaId: contentIdSchema.nullable().optional(),
  placeLocation: placeCollectionDetailsSchema.optional(),
  // A list's own place among its category's lists. displayOrder is where it sits;
  // pinOrder is whether it is pinned above the rest, with null meaning not pinned.
  displayOrder: external_exports.number().int().min(0).max(1e5).optional(),
  pinOrder: external_exports.number().int().min(0).max(1e5).nullable().optional()
}).strict().refine((value) => Object.keys(value).length > 1, "At least one editable field required");
var createRecommendationObjectSchema = external_exports.object({
  category: recommendationCategorySchema,
  entityId: contentIdSchema,
  collectionId: contentIdSchema,
  expectedCollectionRevision: contentRevision,
  userRating: userRating.default(null),
  publicationState: publicationState.default("draft"),
  mediaIds: recommendationMediaIds.default([]),
  note: richNoteSchema.nullable().default(null),
  displayOverrides: displayOverridesSchema.optional(),
  bookContext: bookRecommendationContextSchema.optional(),
  movieContext: movieContextSchema.optional(),
  movieTermIds: external_exports.array(contentIdSchema).max(32).refine((v) => new Set(v).size === v.length).optional(),
  appScreenshots: appScreenshotsSchema.optional(),
  productOffer: productOfferWriteSchema.optional(),
  placeContext: placeRecommendationContextSchema.optional(),
  placePhotos: placePhotosSchema.optional(),
  placesTaxonomy: placesTaxonomyAssignmentSchema.optional(),
  peopleSectorTermId: peopleSectorAssignmentSchema.optional()
}).strict();
var createRecommendationSchema = createRecommendationObjectSchema.refine((v) => (v.category === "places" || v.placesTaxonomy === void 0) && (v.category === "people" || v.peopleSectorTermId === void 0), "Category taxonomy mismatch").refine((v) => v.category === "books" ? v.movieContext === void 0 && v.movieTermIds === void 0 && v.appScreenshots === void 0 && v.productOffer === void 0 && v.placeContext === void 0 && v.placePhotos === void 0 && bookDisplayFieldsSchema.extend({ title: displayTitleWriteSchema.nullable().optional() }).safeParse(v.displayOverrides ?? {}).success : v.category === "movies" ? v.bookContext === void 0 && v.appScreenshots === void 0 && v.productOffer === void 0 && v.placeContext === void 0 && v.placePhotos === void 0 && movieDisplayFieldsSchema.extend({ title: displayTitleWriteSchema.nullable().optional() }).safeParse(v.displayOverrides ?? {}).success : v.category === "apps" ? v.bookContext === void 0 && v.movieContext === void 0 && v.movieTermIds === void 0 && v.productOffer === void 0 && v.placeContext === void 0 && v.placePhotos === void 0 && appDisplayFieldsSchema.extend({ title: displayTitleWriteSchema.nullable().optional() }).safeParse(v.displayOverrides ?? {}).success : v.category === "places" ? v.bookContext === void 0 && v.movieContext === void 0 && v.movieTermIds === void 0 && v.appScreenshots === void 0 && v.productOffer === void 0 && placeDisplayFieldsSchema.extend({ title: displayTitleWriteSchema.nullable().optional() }).safeParse(v.displayOverrides ?? {}).success : v.category === "people" ? v.bookContext === void 0 && v.movieContext === void 0 && v.movieTermIds === void 0 && v.appScreenshots === void 0 && v.productOffer === void 0 && v.placeContext === void 0 && v.placePhotos === void 0 && personDisplayFieldsSchema.extend({ title: displayTitleWriteSchema.nullable().optional() }).safeParse(v.displayOverrides ?? {}).success : v.category === "products" ? v.bookContext === void 0 && v.movieContext === void 0 && v.movieTermIds === void 0 && v.appScreenshots === void 0 && v.placeContext === void 0 && v.placePhotos === void 0 && productDisplayFieldsSchema.extend({ title: displayTitleWriteSchema.nullable().optional() }).safeParse(v.displayOverrides ?? {}).success : v.bookContext === void 0 && v.movieContext === void 0 && v.movieTermIds === void 0 && v.appScreenshots === void 0 && v.productOffer === void 0 && v.placeContext === void 0 && v.placePhotos === void 0 && Object.keys(v.displayOverrides ?? {}).every((k) => k === "title"), "Category values require their own category");
var updateRecommendationSchema = external_exports.object({
  expectedRevision: contentRevision,
  userRating: userRating.optional(),
  publicationState: publicationState.optional(),
  mediaIds: recommendationMediaIds.optional(),
  note: richNoteSchema.nullable().optional(),
  displayOverrides: displayOverridesSchema.optional(),
  bookContext: bookRecommendationContextSchema.optional(),
  movieContext: movieContextSchema.optional(),
  movieTermIds: external_exports.array(contentIdSchema).max(32).refine((v) => new Set(v).size === v.length).optional(),
  appScreenshots: appScreenshotsSchema.optional(),
  productOffer: productOfferWriteSchema.optional(),
  placeContext: placeRecommendationContextSchema.optional(),
  placePhotos: placePhotosSchema.optional(),
  placesTaxonomy: placesTaxonomyAssignmentSchema.optional(),
  peopleSectorTermId: peopleSectorAssignmentSchema.optional()
}).strict().refine((value) => Object.keys(value).length > 1, "At least one editable field required");
var reorderCollectionSchema = external_exports.object({
  expectedRevision: contentRevision,
  orderedRecommendationIds: external_exports.array(contentIdSchema).max(1e4)
}).strict();
var collectionCoreDtoSchema = external_exports.object({
  id: contentIdSchema,
  accountId: contentIdSchema,
  category: contentCategorySchema,
  title: contentTitle,
  slug: contentSlug,
  visibility: contentVisibility,
  publicationState,
  revision: contentRevision,
  description: collectionPlainText,
  heading: collectionHeading,
  coverMediaId: contentIdSchema.nullable()
}).strict();
var createCollectionResultSchema = collectionCoreDtoSchema.extend({
  parentLocation: external_exports.object({ id: contentIdSchema, revision: contentRevision }).strict().optional()
}).strict();
var recommendationCoreDtoSchema = external_exports.object({
  id: contentIdSchema,
  accountId: contentIdSchema,
  entityId: contentIdSchema,
  category: recommendationCategorySchema,
  userRating,
  publicationState,
  revision: contentRevision,
  mediaIds: recommendationMediaIds
}).strict();
var resolveExistingEntitySchema = external_exports.object({ entityId: contentIdSchema, category: recommendationCategorySchema }).strict();
var entityCoreDtoSchema = external_exports.object({ id: contentIdSchema, kind: catalogKindSchema, title: catalogTitleSchema }).strict();
var resolveManualEntitySchema = external_exports.object({ kind: external_exports.literal("manual"), category: topPickCategorySchema, details: external_exports.object({ title: displayTitleWriteSchema }).strict() }).strict();
var resolveProviderGameSchema = external_exports.object({ kind: external_exports.literal("provider"), category: external_exports.literal("games"), provider: external_exports.literal("igdb"), externalKind: external_exports.literal("game"), externalId: gameExternalIdSchema }).strict();
var resolveEntitySchema = external_exports.union([resolveExistingEntitySchema, resolveManualEntitySchema, resolveProviderBookSchema, resolveManualBookSchema, resolveProviderMovieSchema, resolveManualMovieSchema, resolveProviderGameSchema, resolveManualAppSchema, resolveManualProductSchema, resolveManualPersonSchema, resolveManualPlaceSchema]);
var apiErrorCodes = ["UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND", "CONFLICT", "INVALID_INPUT", "RATE_LIMITED", "RESOURCE_TOO_LARGE", "READ_LIMIT", "CONTINUATION_LIMIT", "CURSOR_EXPIRED", "PROVIDER_UNAVAILABLE", "PROVIDER_INVALID_RESPONSE"];
var apiErrorSchema = external_exports.object({
  error: external_exports.object({
    code: external_exports.enum(apiErrorCodes),
    message: external_exports.string(),
    requestId: external_exports.string()
  }).strict()
}).strict();
var mediaDtoSchema = external_exports.object({
  id: external_exports.string().uuid(),
  url: external_exports.string().startsWith("/api/explorers/v1/media/"),
  mimeType: external_exports.string(),
  size: external_exports.number().int().nonnegative().safe(),
  alternativeText: external_exports.string().nullable(),
  caption: external_exports.string().nullable()
}).strict();
var shortText = external_exports.string().trim().max(500);
var addressSchema = external_exports.object({
  address: shortText.optional(),
  streetNumber: shortText.optional(),
  streetName: shortText.optional(),
  postalCode: shortText.optional(),
  state: shortText.optional(),
  city: shortText.optional(),
  country: shortText.optional(),
  title: shortText.optional(),
  businessTitle: shortText.optional(),
  businessAddress: shortText.optional(),
  contact: shortText.optional(),
  businessContact: shortText.optional(),
  website: external_exports.string().url().startsWith("https://").max(2048).optional(),
  businessWebsite: external_exports.string().url().startsWith("https://").max(2048).optional(),
  about: external_exports.string().max(5e3).optional(),
  businessDescription: external_exports.string().max(5e3).optional()
}).strict();
var publicAddressSchema = addressSchema.extend({
  placeId: shortText.optional(),
  places: external_exports.null().optional()
}).strict();
var placeDetailsSchema = external_exports.object({
  placeId: shortText.optional(),
  name: shortText.optional(),
  formattedAddress: shortText.optional(),
  lat: external_exports.number().finite().optional(),
  lng: external_exports.number().finite().optional()
}).strict();
var richTextSchema = external_exports.object({ blocks: external_exports.array(external_exports.object({ text: external_exports.string().max(5e3) }).strict()).max(100) }).strict();
var themeSettingsSchema = external_exports.object({
  preset: external_exports.enum(["cinematic-dark", "glassmorphism", "sunset-glow", "minimal-light", "emerald-nature", "neon-cyber"]).optional(),
  wallpaperMode: external_exports.enum(["banner-top", "full-wallpaper-image", "ambient-gradient", "solid-color"]).optional(),
  wallpaperUrl: external_exports.string().regex(/^\/api\/explorers\/v1\/media\/[0-9a-f-]{36}\/content$/i).optional(),
  accentColor: external_exports.string().regex(/^#[0-9a-f]{3,8}$/i).optional(),
  customTextColor: external_exports.string().regex(/^#[0-9a-f]{3,8}$/i).optional(),
  // .catch(undefined) degrades an unknown stored value (a "music" first view the 0057
  // migration missed) to the default instead of failing the owner read. This schema is
  // shared with writes, so an invalid landingTab on a write is silently dropped too;
  // that is acceptable for a presentation preference. Order matters: under zod/v3
  // .catch(undefined).optional() does not type-check.
  landingTab: external_exports.enum(["all-recommendations", "places", "movies", "books", "games", "guides", "apps", "products", "people", "gallery", "business"]).optional().catch(void 0),
  visibleTabs: external_exports.object({ recommendations: external_exports.boolean().optional(), gallery: external_exports.boolean().optional(), business: external_exports.boolean().optional() }).strict().optional(),
  footerBranding: external_exports.enum(["enabled", "minimal", "disabled"]).optional(),
  recommendations: external_exports.object({
    layout: external_exports.enum(["shelves", "grid", "featured"]).optional(),
    categoryOrder: external_exports.array(categoryKeySchema).max(8).optional()
  }).strict().optional()
}).strict();
var socialLinkSchema = external_exports.object({
  platform: external_exports.enum([
    "instagram",
    "youtube",
    "whatsapp",
    "website",
    "facebook",
    "linkedin",
    "snapchat",
    "tiktok",
    "email",
    "gmail",
    "X",
    "spotify",
    "youtubeMusic",
    "appleMusic",
    "localTunes"
  ]),
  url: external_exports.string().max(2048),
  visible: external_exports.boolean()
}).strict();
var businessDetailsSchema = external_exports.object({ category: shortText.optional(), description: external_exports.string().max(5e3).optional() }).strict();
var feedDetailsSchema = external_exports.object({
  fileName: shortText.optional(),
  aspectRatio: external_exports.enum(["1:1", "4:5", "1.91:1", "9:16"]).optional(),
  width: external_exports.number().int().positive().max(2e4).optional(),
  height: external_exports.number().int().positive().max(2e4).optional()
}).strict();
var profileFeedItemSchema = external_exports.object({
  id: external_exports.string().uuid(),
  mediaId: external_exports.string().uuid().nullable(),
  url: external_exports.string().url().or(external_exports.string().startsWith("/api/explorers/v1/media/")),
  source: external_exports.enum(["manual", "google", "instagram"]),
  type: external_exports.enum(["image", "video"]),
  caption: external_exports.string().nullable(),
  details: feedDetailsSchema
}).strict();
var profileFeedInputSchema = profileFeedItemSchema.omit({ id: true, url: true }).extend({
  externalUrl: external_exports.string().url().startsWith("https://").nullable()
}).strict();
var accountDtoSchema = external_exports.object({
  id: external_exports.string().uuid(),
  handle: external_exports.string().nullable(),
  displayName: external_exports.string().nullable(),
  accountType: external_exports.enum(["Personal", "Creator", "Business"]).nullable(),
  onboardingStatus: external_exports.enum(["incomplete", "complete"]),
  status: external_exports.enum(["active", "suspended", "pending_deletion", "deleted"]),
  revision: external_exports.number().int().positive().safe(),
  publicProfile: external_exports.boolean(),
  autoPinning: external_exports.boolean(),
  locale: external_exports.string(),
  mobileNumber: external_exports.string().nullable(),
  mobileNumberVisible: external_exports.boolean(),
  bioPlain: external_exports.string().nullable(),
  bioRich: richTextSchema.nullable(),
  primaryAddress: addressSchema.nullable(),
  additionalAddresses: external_exports.array(addressSchema).max(20),
  publicAddress: publicAddressSchema.nullable(),
  profilePlaceDetails: placeDetailsSchema.nullable(),
  categories: external_exports.array(external_exports.object({ category: categoryKeySchema, isPublic: external_exports.boolean(), displayOrder: external_exports.number().int().nonnegative(), pinnedOrder: external_exports.number().int().nonnegative().nullable() }).strict()),
  themeSettings: themeSettingsSchema,
  socialLinks: external_exports.array(socialLinkSchema).max(20),
  businessDetails: businessDetailsSchema,
  profileImage: mediaDtoSchema.optional(),
  backgroundImage: mediaDtoSchema.optional(),
  feedItems: external_exports.array(profileFeedItemSchema)
}).strict();
var nullableText = external_exports.string().trim().max(5e3).nullable();
var updateAccountInputSchema = external_exports.object({
  handle: external_exports.string().trim().min(3).max(30).nullable().optional(),
  displayName: external_exports.string().trim().min(1).max(200).nullable().optional(),
  accountType: external_exports.enum(["Personal", "Creator", "Business"]).nullable().optional(),
  onboardingStatus: external_exports.enum(["complete"]).optional(),
  publicProfile: external_exports.boolean().optional(),
  autoPinning: external_exports.boolean().optional(),
  locale: accountLocale.optional(),
  mobileNumber: nullableText.optional(),
  mobileNumberVisible: external_exports.boolean().optional(),
  bioPlain: nullableText.optional(),
  bioRich: richTextSchema.nullable().optional(),
  primaryAddress: addressSchema.nullable().optional(),
  additionalAddresses: external_exports.array(addressSchema).max(20).optional(),
  publicAddress: publicAddressSchema.nullable().optional(),
  profilePlaceDetails: placeDetailsSchema.nullable().optional(),
  categories: external_exports.array(external_exports.object({ category: retiredCategoryKeySchema, isPublic: external_exports.boolean(), displayOrder: external_exports.number().int().nonnegative(), pinnedOrder: external_exports.number().int().nonnegative().nullable() }).strict()).optional(),
  themeSettings: themeSettingsSchema.optional(),
  socialLinks: external_exports.array(socialLinkSchema).max(20).optional(),
  businessDetails: businessDetailsSchema.optional(),
  profileImageId: external_exports.string().uuid().nullable().optional(),
  backgroundImageId: external_exports.string().uuid().nullable().optional(),
  feedItems: external_exports.array(profileFeedInputSchema).max(100).optional()
}).strict();
var updateAccountRequestSchema = updateAccountInputSchema.extend({ expectedRevision: external_exports.number().int().positive().safe() }).strict();

// shared/explorersAppEnrichmentContract.ts
var appEnrichmentRevisionSchema = external_exports.number().int().positive().safe();
var label = external_exports.string().min(1).max(2048);
var hash = external_exports.string().regex(/^[a-f0-9]{64}$/);
var timestamp = external_exports.string().datetime({ offset: true });
var appSourceIdentitySchema = external_exports.object({ sourceId: label, sourceIdentity: label, sourceIdentityHash: hash, canonicalizationVersion: label }).strict();
var appSourceChoiceSchema = external_exports.object({ identity: appSourceIdentitySchema, label: external_exports.string().min(1).max(120).refine((v) => v.trim() === v && !/[<>]/.test(v) && !/[\u0000-\u001f\u007f-\u009f]/.test(v) && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v), "Invalid source label"), sourceUrl: safeAppUrlSchema.refine((v) => {
  try {
    return new URL(v).protocol === "https:" && new URL(v).href === v;
  } catch {
    return false;
  }
}, "Canonical HTTPS source required") }).strict();
var appSelectableFields = ["title", "description", "priceTier", "platforms"];
var appSelectedFieldsSchema = external_exports.array(external_exports.enum(appSelectableFields)).max(4).refine((v) => new Set(v).size === v.length, "Duplicate field");
var appSnapshotFieldsSchema = appDisplayFieldsSchema.pick({ description: true, priceTier: true, platforms: true }).extend({ title: appTitleSchema.pipe(displayTitleWriteSchema).optional() }).strict();
var appCompleteOverridesSchema = appDisplayFieldsSchema.extend({ title: displayTitleWriteSchema.nullable().optional() }).strict().pipe(displayOverridesSchema);
var appFieldProvenanceSchema = external_exports.object({ sourceUrl: safeAppUrlSchema, observedAt: timestamp }).strict();
var provenance = external_exports.object({ title: appFieldProvenanceSchema.optional(), description: appFieldProvenanceSchema.optional(), priceTier: appFieldProvenanceSchema.optional(), platforms: appFieldProvenanceSchema.optional() }).strict();
var own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
var appSnapshotSchema = appSourceIdentitySchema.extend({ snapshotId: contentIdSchema, appEntityId: contentIdSchema, adapterVersion: label, fetchedAt: timestamp, contentHash: hash, fields: appSnapshotFieldsSchema, fieldProvenance: provenance }).strict().superRefine((v, ctx) => {
  for (const key of appSelectableFields) {
    if (own(v.fields, key) !== own(v.fieldProvenance, key) || own(v.fields, key) && v.fields[key] === void 0 || own(v.fieldProvenance, key) && v.fieldProvenance[key] === void 0) ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["fieldProvenance", key], message: "Every supplied field requires exactly matching provenance" });
  }
});
var owned = { accountId: contentIdSchema, recommendationId: contentIdSchema, appEntityId: contentIdSchema };
var appBindingSchema = external_exports.object({ ...owned, bindingId: contentIdSchema, optIn: external_exports.boolean(), bindingRevision: appEnrichmentRevisionSchema, currentGenerationId: contentIdSchema.nullable() }).strict();
var appOwnerBindingSchema = appBindingSchema.extend({ currentSource: appSourceIdentitySchema.nullable() }).superRefine((value, context) => {
  if (value.currentGenerationId === null !== (value.currentSource === null)) context.addIssue({ code: external_exports.ZodIssueCode.custom, message: "Current generation requires its authoritative source" });
});
var appGenerationSchema = appSourceIdentitySchema.extend({ ...owned, generationId: contentIdSchema, bindingId: contentIdSchema, createdAt: timestamp }).strict();
var appGenerationRetirementSchema = external_exports.object({ generationId: contentIdSchema, retiredAt: timestamp }).strict();
var appEntitlementSchema = external_exports.object({ ...owned, snapshotId: contentIdSchema, generationId: contentIdSchema, observedBindingRevision: appEnrichmentRevisionSchema }).strict();
var revisions = { expectedRecommendationRevision: appEnrichmentRevisionSchema, expectedBindingRevision: appEnrichmentRevisionSchema };
var configureAppEnrichmentSchema = appSourceIdentitySchema.extend({ ...revisions, expectedBindingRevision: appEnrichmentRevisionSchema.nullable(), operation: external_exports.literal("configureAppEnrichment"), optIn: external_exports.boolean() }).strict();
var rebindAppEnrichmentSchema = appSourceIdentitySchema.extend({ ...revisions, operation: external_exports.literal("rebindAppEnrichment"), optIn: external_exports.boolean() }).strict();
var disableAppEnrichmentSchema = external_exports.object({ ...revisions, operation: external_exports.literal("disableAppEnrichment") }).strict();
var acceptAppEnrichmentSchema = external_exports.object({ ...revisions, operation: external_exports.literal("acceptAppEnrichment"), snapshotId: contentIdSchema, selectedFields: appSelectedFieldsSchema }).strict();
var appEnrichmentCommandSchema = external_exports.discriminatedUnion("operation", [configureAppEnrichmentSchema, rebindAppEnrichmentSchema, disableAppEnrichmentSchema, acceptAppEnrichmentSchema]);
var appBindingResultSchema = external_exports.object({ recommendationId: contentIdSchema, bindingId: contentIdSchema, bindingGenerationId: contentIdSchema.nullable(), optIn: external_exports.boolean(), bindingRevision: appEnrichmentRevisionSchema, recommendationRevision: appEnrichmentRevisionSchema, categoryContentRevision: categoryContentRevisionSchema, changed: external_exports.boolean(), receiptId: contentIdSchema }).strict();
var appAcceptanceResultSchema = external_exports.object({ recommendationId: contentIdSchema, snapshotId: contentIdSchema, bindingGenerationId: contentIdSchema, acceptedFields: appSelectedFieldsSchema, changed: external_exports.boolean(), recommendationRevision: appEnrichmentRevisionSchema, categoryContentRevision: categoryContentRevisionSchema, receiptId: contentIdSchema }).strict();
var appAcceptanceRecordSchema = external_exports.object({ acceptanceId: contentIdSchema, accountId: contentIdSchema, recommendationId: contentIdSchema, snapshotId: contentIdSchema, generationId: contentIdSchema, selectedFields: appSelectedFieldsSchema, acceptedValues: appSnapshotFieldsSchema, actorUserId: contentIdSchema, receiptId: contentIdSchema, acceptedAt: timestamp }).strict().superRefine((v, ctx) => {
  if (appSelectableFields.some((k) => v.selectedFields.includes(k) !== own(v.acceptedValues, k) || own(v.acceptedValues, k) && v.acceptedValues[k] === void 0)) ctx.addIssue({ code: external_exports.ZodIssueCode.custom, message: "Accepted values must exactly match selected fields" });
});

// server/services/appEnrichmentDecoderFields.ts
var validateAppDecoderFields = (fields5) => appSnapshotFieldsSchema.parse(fields5);
var validateAppDecoderIdentity = (identity2) => appSourceIdentitySchema.parse(identity2);
var validateAppDecoderObservedAt = (observedAt) => external_exports.string().datetime({ offset: true }).parse(observedAt);
export {
  validateAppDecoderFields,
  validateAppDecoderIdentity,
  validateAppDecoderObservedAt
};
