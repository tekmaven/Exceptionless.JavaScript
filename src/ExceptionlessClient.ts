import { IConfigurationSettings } from './configuration/IConfigurationSettings';
import { Configuration } from './configuration/Configuration';
import { EventBuilder } from './EventBuilder';
import { IEvent } from './models/IEvent';
import { IError } from './models/IError';
import { EventPluginContext } from './plugins/EventPluginContext';
import { EventPluginManager } from './plugins/EventPluginManager';
import { ContextData } from './plugins/ContextData';

export class ExceptionlessClient {
  public config:Configuration;

  constructor();
  constructor(settings:IConfigurationSettings);
  constructor(apiKey:string, serverUrl?:string);
  constructor(settingsOrApiKey?:IConfigurationSettings|string, serverUrl?:string) {
    // TODO: populate this in a plugin..
    //var settings = this.getSettingsFromScriptTag() || {};

    if (typeof settingsOrApiKey !== 'object') {
      this.config = new Configuration(settingsOrApiKey);
    } else {
      this.config = new Configuration({ apiKey: <string>settingsOrApiKey, serverUrl: serverUrl });
    }
  }

  public createException(exception:Error): EventBuilder {
    var pluginContextData = new ContextData();
    pluginContextData.setException(exception);
    return this.createEvent(pluginContextData).setType('error');
  }

  public submitException(exception:Error): void {
    this.createException(exception).submit();
  }

  public createUnhandledException(exception:Error, submissionMethod?:string): EventBuilder {
    var builder = this.createException(exception);
    builder.pluginContextData.markAsUnhandledError();
    builder.pluginContextData.setSubmissionMethod(submissionMethod);

    return builder;
  }

  public submitUnhandledException(exception:Error, submissionMethod?:string) {
    this.createUnhandledException(exception, submissionMethod).submit();
  }

  public createFeatureUsage(feature:string): EventBuilder {
    return this.createEvent().setType('usage').setSource(feature);
  }

  public submitFeatureUsage(feature:string): void {
    this.createFeatureUsage(feature).submit();
  }

  public createLog(message:string): EventBuilder;
  public createLog(source:string, message:string): EventBuilder;
  public createLog(source:string, message:string, level:string): EventBuilder;
  public createLog(sourceOrMessage:string, message?:string, level?:string): EventBuilder {
    var builder = this.createEvent().setType('log');

    if (sourceOrMessage && message && level) {
      builder = builder.setSource(sourceOrMessage).setMessage(message).setProperty('@level', level);
    } else if (sourceOrMessage && message) {
      builder = builder.setSource(sourceOrMessage).setMessage(message);
    } else {
      // TODO: Look into using https://www.stevefenton.co.uk/Content/Blog/Date/201304/Blog/Obtaining-A-Class-Name-At-Runtime-In-TypeScript/
      var source = (<any>(arguments.callee.caller)).name;
      builder = builder.setSource(source).setMessage(sourceOrMessage);
    }

    return builder;
  }

  public submitLog(message:string): void;
  public submitLog(source:string, message:string): void;
  public submitLog(source:string, message:string, level:string): void;
  public submitLog(sourceOrMessage:string, message?:string, level?:string): void {
    this.createLog(sourceOrMessage, message, level).submit();
  }

  public createNotFound(resource:string): EventBuilder {
    return this.createEvent().setType('404').setSource(resource);
  }

  public submitNotFound(resource:string): void {
    this.createNotFound(resource).submit();
  }

  public createSessionStart(sessionId:string): EventBuilder {
    return this.createEvent().setType('start').setSessionId(sessionId);
  }

  public submitSessionStart(sessionId:string): void {
    this.createSessionStart(sessionId).submit();
  }

  public createSessionEnd(sessionId:string): EventBuilder {
    return this.createEvent().setType('end').setSessionId(sessionId);
  }

  public submitSessionEnd(sessionId:string): void {
    this.createSessionEnd(sessionId).submit();
  }

  public createEvent(pluginContextData?:ContextData): EventBuilder {
    return new EventBuilder({ date: new Date() }, this, pluginContextData);
  }

  public submitEvent(event:IEvent, pluginContextData?:ContextData): void {
    if (!event) {
      return;
    }

    if (!this.config.enabled) {
      return this.config.log.info('Event submission is currently disabled.');
    }

    if (!event.data) {
      event.data = {};
    }

    if (!event.tags || !event.tags.length) {
      event.tags = [];
    }

    var context = new EventPluginContext(this, event, pluginContextData);
    return EventPluginManager.run(context, () => {
      // ensure all required data
      if (!event.type || event.type.length === 0) {
        event.type = 'log';
      }

      if (!event.date) {
        event.date = new Date();
      }

      this.config.queue.enqueue(event);

      if (event.reference_id && event.reference_id.length > 0) {
        this.config.log.info(`Setting last reference id '${event.reference_id}'`);
        this.config.lastReferenceIdManager.setLast(event.reference_id);
      }
    });
  }

  public getLastReferenceId(): string {
    return this.config.lastReferenceIdManager.getLast();
  }

  private static _instance:ExceptionlessClient = null;
  public static get default() {
    if(ExceptionlessClient._instance === null) {
      ExceptionlessClient._instance = new ExceptionlessClient(null);
    }
    return ExceptionlessClient._instance;
  }
}
