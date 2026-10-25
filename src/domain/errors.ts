export class DomainError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly title: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  constructor(
    message: string,
    readonly issues: { path: string; message: string }[] = [],
  ) {
    super(message, 400, "Validation Failed");
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string) {
    super(message, 404, "Not Found");
  }
}

export class UnsupportedDocumentError extends DomainError {
  constructor(message: string) {
    super(message, 415, "Unsupported Media Type");
  }
}

/** The feature needs configuration that is missing (e.g. no API key for live answers). */
export class NotConfiguredError extends DomainError {
  constructor(message: string) {
    super(message, 503, "Service Not Configured");
  }
}
