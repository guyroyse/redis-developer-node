import { Schema } from "../schema/schema";
import { Client, LimitOptions, SearchOptions } from "../client";
import { Entity } from '../entity/entity';

import { Where } from './where';
import { WhereAnd } from './where-and';
import { WhereOr } from './where-or';
import { WhereField } from './where-field';
import { WhereStringArray } from './where-string-array';
import { WhereHashBoolean, WhereJsonBoolean } from './where-boolean';
import { WhereNumber } from './where-number';
import { WherePoint } from './where-point';
import { WhereString } from './where-string';
import { WhereText } from './where-text';

import { HashSearchResultsConverter, JsonSearchResultsConverter } from "./results-converter";
import { RedisError } from "../errors";
import { SortOptions } from "../client";
import { WhereDate } from "./where-date";
import { SortableFieldDefinition } from "../schema/definition";

/**
 * A function that takes a {@link Search} and returns a {@link Search}. Used in nested queries.
 * @template TEntity The type of {@link Entity} being sought.
 */
export type SubSearchFunction<TEntity extends Entity> = (search: Search<TEntity>) => Search<TEntity>

type AndOrConstructor = new (left: Where, right: Where) => Where;

/**
 * Abstract base class for {@link Search} and {@link RawSearch} that
 * contains methods to return search results.
 * @template TEntity The type of {@link Entity} being sought.
 */
export abstract class AbstractSearch<TEntity extends Entity> {

  /** @internal */
  protected schema: Schema<TEntity>;

  /** @internal */
  protected client: Client;

  /** @internal */
  protected sort?: SortOptions;

  /** @internal */
  constructor(schema: Schema<TEntity>, client: Client) {
    this.schema = schema;
    this.client = client;
  }

  /** @internal */
  abstract get query(): string;

  /**
   * Applies an ascending sort to the query.
   * @param field The field to sort by.
   * @returns this
   */
  sortAscending(field: string): AbstractSearch<TEntity> {
    return this.sortBy(field, 'ASC');
  }

  /**
   * Alias for {@link Search.sortDescending}.
   */
  sortDesc(field: string): AbstractSearch<TEntity> {
    return this.sortDescending(field);
  }

  /**
   * Applies a descending sort to the query.
   * @param field The field to sort by.
   * @returns this
   */
  sortDescending(field: string): AbstractSearch<TEntity> {
    return this.sortBy(field, 'DESC');
  }

  /**
   * Alias for {@link Search.sortAscending}.
   */
  sortAsc(field: string): AbstractSearch<TEntity> {
    return this.sortAscending(field);
  }

  /**
     * Applies sorting for the query.
     * @param field The field to sort by.
     * @param order The order of returned {@link Entity | Entities} Defaults to `ASC` (ascending) if not specified
     * @returns this
     */
  sortBy(field: string, order: 'ASC' | 'DESC' = 'ASC'): AbstractSearch<TEntity> {
    const fieldDef = this.schema.definition[field];
    const dataStructure = this.schema.dataStructure;

    if (fieldDef === undefined) {
      const message = `'sortBy' was called on field '${field}' which is not defined in the Schema.`;
      console.error(message);
      throw new RedisError(message)
    }

    const type = fieldDef.type;
    const markedSortable = (fieldDef as SortableFieldDefinition).sortable;

    const UNSORTABLE = ['point', 'string[]'];
    const JSON_SORTABLE = ['number', 'text', 'date'];
    const HASH_SORTABLE = ['string', 'boolean', 'number', 'text', 'date'];

    if (UNSORTABLE.includes(type)) {
      const message = `'sortBy' was called on '${type}' field '${field}' which cannot be sorted.`;
      console.error(message);
      throw new RedisError(message)
    }

    if (dataStructure === 'JSON' && JSON_SORTABLE.includes(type) && !markedSortable)
      console.warn(`'sortBy' was called on field '${field}' which is not marked as sortable in the Schema. This may result is slower searches. If possible, mark the field as sortable in the Schema.`);

    if (dataStructure === 'HASH' && HASH_SORTABLE.includes(type) && !markedSortable)
      console.warn(`'sortBy' was called on field '${field}' which is not marked as sortable in the Schema. This may result is slower searches. If possible, mark the field as sortable in the Schema.`);

    this.sort = { field, order };
    return this;
  }

  /**
   * Finds the {@link Entity} with the minimal value for a field.
   * @param field The field with the minimal value.
   * @returns The {@link Entity} with the minimal value
   */
  async min(field: string): Promise<TEntity | null> {
    return await this.sortBy(field, 'ASC').first();
  }

  /**
   * Finds the entity ID with the minimal value for a field.
   * @param field The field with the minimal value.
   * @returns The entity ID with the minimal value
   */
  async minId(field: string): Promise<string | null> {
    const key = await this.minKey(field);
    return this.keyToEntityId(key);
  }

  /**
   * Finds the key name in Redis with the minimal value for a field.
   * @param field The field with the minimal value.
   * @returns The key name with the minimal value
   */
  async minKey(field: string): Promise<string | null> {
    return await this.sortBy(field, 'ASC').firstKey();
  }

  /**
   * Finds the {@link Entity} with the maximal value for a field.
   * @param field The field with the maximal value.
   * @returns The entity ID {@link Entity} with the maximal value
   */
  async max(field: string): Promise<TEntity | null> {
    return await this.sortBy(field, 'DESC').first();
  }

  /**
   * Finds the entity ID with the maximal value for a field.
   * @param field The field with the maximal value.
   * @returns The entity ID with the maximal value
   */
  async maxId(field: string): Promise<string | null>{
    const key = await this.maxKey(field);
    return this.keyToEntityId(key);
  }

  /**
   * Finds the key name in Redis with the maximal value for a field.
   * @param field The field with the maximal value.
   * @returns The key name with the maximal value
   */
  async maxKey(field: string): Promise<string | null> {
    return await this.sortBy(field, 'DESC').firstKey();
  }

  /**
   * Returns the number of {@link Entity | Entities} that match this query.
   * @returns
   */
  async count(): Promise<number> {
    const searchResults = await this.callSearch()
    return this.schema.dataStructure === 'JSON'
      ? new JsonSearchResultsConverter(this.schema, searchResults).count
      : new HashSearchResultsConverter(this.schema, searchResults).count;
  }

  /**
   * Returns a page of {@link Entity | Entities} that match this query.
   * @param offset The offset for where to start returning {@link Entity | Entities}.
   * @param count The number of {@link Entity | Entities} to return.
   * @returns An array of {@link Entity | Entities} matching the query.
   */
  async page(offset: number, count: number): Promise<TEntity[]> {
    const searchResults = await this.callSearch({ offset, count });
    return this.schema.dataStructure === 'JSON'
      ? new JsonSearchResultsConverter(this.schema, searchResults).entities
      : new HashSearchResultsConverter(this.schema, searchResults).entities;
  }

  /**
   * Returns a page of entity IDs that match this query.
   * @param offset The offset for where to start returning entity IDs.
   * @param count The number of entity IDs to return.
   * @returns An array of strings matching the query.
   */
   async pageOfIds(offset: number, count: number): Promise<string[]> {
    const keys = await this.pageOfKeys(offset, count);
    return this.keysToEntityIds(keys);
  }

  /**
   * Returns a page of key names in Redis that match this query.
   * @param offset The offset for where to start returning key names.
   * @param count The number of key names to return.
   * @returns An array of strings matching the query.
   */
  async pageOfKeys(offset: number, count: number): Promise<string[]> {
    const [ _count, ...keys] = await this.callSearch({ offset, count }, true);
    return keys;
  }

  /**
   * Returns the first {@link Entity} that matches this query.
   */
  async first(): Promise<TEntity | null> {
    const foundEntity = await this.page(0, 1);
    return foundEntity[0] ?? null;
  }

  /**
   * Returns the first entity ID that matches this query.
   */
   async firstId(): Promise<string | null> {
    const key = await this.firstKey()
    return this.keyToEntityId(key)
  }

  /**
   * Returns the first key name that matches this query.
   */
   async firstKey(): Promise<string | null> {
    const foundIds = await this.pageOfKeys(0, 1);
    return foundIds[0] ?? null;
  }

  /**
   * Returns all the {@link Entity | Entities} that match this query. This method
   * makes multiple calls to Redis until all the {@link Entity | Entities} are returned.
   * You can specify the batch size by setting the `pageSize` property on the
   * options:
   *
   * ```typescript
   * const entities = await repository.search().returnAll({ pageSize: 100 });
   * ```
   *
   * @param options Options for the call.
   * @param options.pageSize Number of {@link Entity | Entities} returned per batch.
   * @returns An array of {@link Entity | Entities} matching the query.
   */
  async all(options = { pageSize: 10 }): Promise<TEntity[]> {
    const entities: TEntity[] = [];
    let offset = 0;
    const pageSize = options.pageSize;

    while (true) {
      const foundEntities = await this.page(offset, pageSize);
      entities.push(...foundEntities);
      if (foundEntities.length < pageSize) break;
      offset += pageSize;
    }

    return entities;
  }

  /**
   * Returns all the entity IDs that match this query. This method
   * makes multiple calls to Redis until all the entity IDs are returned.
   * You can specify the batch size by setting the `pageSize` property on the
   * options:
   *
   * ```typescript
   * const keys = await repository.search().returnAllIds({ pageSize: 100 });
   * ```
   *
   * @param options Options for the call.
   * @param options.pageSize Number of entity IDs returned per batch.
   * @returns An array of entity IDs matching the query.
   */
  async allIds(options = { pageSize: 10 }): Promise<string[]> {
    const keys = await this.allKeys(options)
    return this.keysToEntityIds(keys);
  }

  /**
   * Returns all the key names in Redis that match this query. This method
   * makes multiple calls to Redis until all the key names are returned.
   * You can specify the batch size by setting the `pageSize` property on the
   * options:
   *
   * ```typescript
   * const keys = await repository.search().returnAllKeys({ pageSize: 100 });
   * ```
   *
   * @param options Options for the call.
   * @param options.pageSize Number of key names returned per batch.
   * @returns An array of key names matching the query.
   */
  async allKeys(options = { pageSize: 10 }): Promise<string[]> {
    const keys: string[] = [];
    let offset = 0;
    const pageSize = options.pageSize;

    while (true) {
      const foundKeys = await this.pageOfKeys(offset, pageSize);
      keys.push(...foundKeys);
      if (foundKeys.length < pageSize) break;
      offset += pageSize;
    }

    return keys;
  }

  /**
   * Returns the current instance. Syntactic sugar to make your code more fluent.
   * @returns this
   */
  get return(): AbstractSearch<TEntity> {
    return this;
  }

  /**
   * Alias for {@link Search.min}.
   */
  async returnMin(field: string): Promise<TEntity | null> {
    return await this.min(field);
  }

  /**
   * Alias for {@link Search.minId}.
   */
  async returnMinId(field: string): Promise<string | null> {
    return await this.minId(field);
  }

  /**
   * Alias for {@link Search.minKey}.
   */
  async returnMinKey(field: string): Promise<string | null> {
    return await this.minKey(field);
  }

  /**
   * Alias for {@link Search.max}.
   */
  async returnMax(field: string): Promise<TEntity | null> {
    return await this.max(field);
  }

  /**
   * Alias for {@link Search.maxId}.
   */
  async returnMaxId(field: string): Promise<string | null> {
    return await this.maxId(field);
  }

  /**
   * Alias for {@link Search.maxKey}.
   */
  async returnMaxKey(field: string): Promise<string | null> {
    return await this.maxKey(field);
  }

  /**
   * Alias for {@link Search.count}.
   */
  async returnCount(): Promise<number> {
    return await this.count();
  }

  /**
   * Alias for {@link Search.page}.
   */
  async returnPage(offset: number, count: number): Promise<TEntity[]> {
    return await this.page(offset, count);
  }

  /**
   * Alias for {@link Search.pageOfIds}.
   */
  async returnPageOfIds(offset: number, count: number): Promise<string[]> {
    return await this.pageOfIds(offset, count);
  }

  /**
   * Alias for {@link Search.pageOrKeys}.
   */
  async returnPageOfKeys(offset: number, count: number): Promise<string[]> {
    return await this.pageOfKeys(offset, count);
  }

  /**
   * Alias for {@link Search.first}.
   */
  async returnFirst(): Promise<TEntity | null> {
    return await this.first();
  }

  /**
   * Alias for {@link Search.firstId}.
   */
  async returnFirstId(): Promise<string | null> {
    return await this.firstId();
  }

  /**
   * Alias for {@link Search.firstKey}.
   */
  async returnFirstKey(): Promise<string | null> {
    return await this.firstKey();
  }

  /**
   * Alias for {@link Search.all}.
   */
   async returnAll(options = { pageSize: 10 }): Promise<TEntity[]> {
    return await this.all(options)
  }

  /**
   * Alias for {@link Search.allIds}.
   */
  async returnAllIds(options = { pageSize: 10 }): Promise<string[]> {
    return await this.allIds(options)
  }

  /**
   * Alias for {@link Search.allKeys}.
   */
  async returnAllKeys(options = { pageSize: 10 }): Promise<string[]> {
    return await this.allKeys(options)
  }

  private async callSearch(limit: LimitOptions = { offset: 0, count: 0 }, keysOnly = false) {
    const options: SearchOptions = {
      indexName: this.schema.indexName,
      query: this.query,
      limit,
      keysOnly
    };

    if (this.sort !== undefined) options.sort = this.sort;

    let searchResults;
    try {
      searchResults = await this.client.search(options);
    } catch (error) {
      const message = (error as Error).message
      if (message.startsWith("Syntax error")) {
        throw new RedisError(`The query to RediSearch had a syntax error: "${message}".\nThis is often the result of using a stop word in the query. Either change the query to not use a stop word or change the stop words in the schema definition. You can check the RediSearch source for the default stop words at: https://github.com/RediSearch/RediSearch/blob/master/src/stopwords.h.`)
      }
      throw error
    }
    return searchResults
  }

  private keysToEntityIds(keys: string[]): string[] {
    return keys.map(key => this.keyToEntityId(key) ?? '');
  }

  private keyToEntityId(key: string | null): string | null {
    return key ? key.replace(`${this.schema.prefix}:`, '') : null;
  }
}


/**
 * Entry point to raw search which allows using raw RediSearch queries
 * against Redis OM. Requires that RediSearch (and optionally RedisJSON) be
 * installed.
 * @template TEntity The type of {@link Entity} being sought.
 */
export class RawSearch<TEntity extends Entity> extends AbstractSearch<TEntity> {
  private rawQuery: string;

  /** @internal */
  constructor(schema: Schema<TEntity>, client: Client, query: string = '*') {
    super(schema, client);
    this.rawQuery = query;
  }

  /** @internal */
  get query(): string {
    return this.rawQuery;
  }
}


/**
 * Entry point to fluent search. This is the default Redis OM experience.
 * Requires that RediSearch (and optionally RedisJSON) be installed.
 * @template TEntity The type of {@link Entity} being sought.
 */
export class Search<TEntity extends Entity> extends AbstractSearch<TEntity> {
  private rootWhere?: Where;

  /** @internal */
  get query(): string {
    if (this.rootWhere === undefined) return '*';
    return `${this.rootWhere.toString()}`;
  }

  /**
   * Sets up a query matching a particular field. If there are multiple calls
   * to {@link Search.where}, they are treated logically as AND.
   * @param field The field to filter on.
   * @returns A subclass of {@link WhereField} matching the type of the field.
   */
  where(field: string): WhereField<TEntity>;

  /**
   * Sets up a nested search. If there are multiple calls to {@link Search.where},
   * they are treated logically as AND.
   * @param subSearchFn A function that takes a {@link Search} and returns another {@link Search}.
   * @returns `this`.
   */
  where(subSearchFn: SubSearchFunction<TEntity>): Search<TEntity>;
  where(fieldOrFn: string | SubSearchFunction<TEntity>): WhereField<TEntity> | Search<TEntity> {
    return this.anyWhere(WhereAnd, fieldOrFn);
  }

  /**
   * Sets up a query matching a particular field as a logical AND.
   * @param field The field to filter on.
   * @returns A subclass of {@link WhereField} matching the type of the field.
   */
  and(field: string): WhereField<TEntity>;

  /**
   * Sets up a nested search as a logical AND.
   * @param subSearchFn A function that takes a {@link Search} and returns another {@link Search}.
   * @returns `this`.
   */
  and(subSearchFn: SubSearchFunction<TEntity>): Search<TEntity>;
  and(fieldOrFn: string | SubSearchFunction<TEntity>): WhereField<TEntity> | Search<TEntity> {
    return this.anyWhere(WhereAnd, fieldOrFn);
  }

  /**
   * Sets up a query matching a particular field as a logical OR.
   * @param field The field to filter on.
   * @returns A subclass of {@link WhereField} matching the type of the field.
   */
  or(field: string): WhereField<TEntity>;

  /**
   * Sets up a nested search as a logical OR.
   * @param subSearchFn A function that takes a {@link Search} and returns another {@link Search}.
   * @returns `this`.
   */
  or(subSearchFn: SubSearchFunction<TEntity>): Search<TEntity>;
  or(fieldOrFn: string | SubSearchFunction<TEntity>): WhereField<TEntity> | Search<TEntity> {
    return this.anyWhere(WhereOr, fieldOrFn);
  }

  private anyWhere(ctor: AndOrConstructor, fieldOrFn: string | SubSearchFunction<TEntity>): WhereField<TEntity> | Search<TEntity> {
    if (typeof fieldOrFn === 'string') {
      return this.anyWhereForField(ctor, fieldOrFn);
    } else {
      return this.anyWhereForFunction(ctor, fieldOrFn);
    }
  }

  private anyWhereForField(ctor: AndOrConstructor, field: string): WhereField<TEntity> {
    const where = this.createWhere(field);

    if (this.rootWhere === undefined) {
      this.rootWhere = where;
    } else {
      this.rootWhere = new ctor(this.rootWhere, where);
    }

    return where;
  }

  private anyWhereForFunction(ctor: AndOrConstructor, subSearchFn: SubSearchFunction<TEntity>): Search<TEntity> {
    const search = new Search<TEntity>(this.schema, this.client);
    const subSearch = subSearchFn(search);

    if (subSearch.rootWhere === undefined) {
      throw new Error("Sub-search without and root where was somehow defined.");
    } else {
      if (this.rootWhere === undefined) {
        this.rootWhere = subSearch.rootWhere;
      } else {
        this.rootWhere = new ctor(this.rootWhere, subSearch.rootWhere);
      }
    }

    return this;
  }

  private createWhere(field: string): WhereField<TEntity> {
    const fieldDef = this.schema.definition[field];

    if (fieldDef === undefined) throw new Error(`The field '${field}' is not part of the schema.`);

    if (fieldDef.type === 'boolean' && this.schema.dataStructure === 'HASH') return new WhereHashBoolean<TEntity>(this, field);
    if (fieldDef.type === 'boolean' && this.schema.dataStructure === 'JSON') return new WhereJsonBoolean<TEntity>(this, field);
    if (fieldDef.type === 'date') return new WhereDate<TEntity>(this, field);
    if (fieldDef.type === 'number') return new WhereNumber<TEntity>(this, field);
    if (fieldDef.type === 'point') return new WherePoint<TEntity>(this, field);
    if (fieldDef.type === 'text') return new WhereText<TEntity>(this, field);
    if (fieldDef.type === 'string') return new WhereString<TEntity>(this, field);
    if (fieldDef.type === 'string[]') return new WhereStringArray<TEntity>(this, field);

    // @ts-ignore: This is a trap for JavaScript
    throw new Error(`The field type of '${fieldDef.type}' is not a valid field type. Valid types include 'boolean', 'date', 'number', 'point', 'string', and 'string[]'.`);
  }
}
