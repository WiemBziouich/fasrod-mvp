export class FakeNavexClient {
  constructor(results) {
    this.results = results;
  }

  async getStates(codes) {
    return codes.map((code) =>
      this.results.find((result) => result.code === code) ?? {
        status: 0,
        code,
        etat: "",
        status_message: "",
      }
    );
  }
}
