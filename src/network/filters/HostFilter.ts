import { NetworkRequest } from '../NetworkRequest';
import type { RequestFilter, RequestFilterOptions } from './RequestFilter';

export class HostFilter implements RequestFilter {
  public apply(
    request: NetworkRequest,
    { includeHosts }: RequestFilterOptions
  ): boolean {
    const { host } = request.parsedURL;

    return !!includeHosts?.some((pattern: string): boolean =>
      new RegExp(pattern).test(host)
    );
  }

  public wouldApply(options: RequestFilterOptions): boolean {
    return (
      Array.isArray(options.includeHosts) && options.includeHosts.length > 0
    );
  }
}
