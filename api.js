import GeoDb from "https://cdn.skypack.dev/wft-geodb-js-client";
import { RAPID_API_KEY, RAPID_API_HOST, BASE_URL } from "./config.js";

export const createGeoDbClient = () => {
  const client = GeoDb.ApiClient.instance;
  const auth = client.authentications["UserSecurity"];
  auth.apiKey = RAPID_API_KEY;

  client.basePath = BASE_URL;
  client.defaultHeaders = client.defaultHeaders || {};
  client.defaultHeaders["X-RapidAPI-Host"] = RAPID_API_HOST;
  if (client.defaultHeaders["User-Agent"]) {
    delete client.defaultHeaders["User-Agent"];
  }

  const api = new GeoDb.GeoApi();

  const findCities = (opts = {}) => api.findCitiesUsingGET(opts);

  return { findCities };
};
