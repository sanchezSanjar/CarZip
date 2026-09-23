import { Injectable } from '@nestjs/common';

@Injectable()
export class CarzipBatchService {
  getHello(): string {
    return 'Hello World!';
  }
}
