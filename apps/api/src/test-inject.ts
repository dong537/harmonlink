import 'reflect-metadata';
import { Injectable } from '@nestjs/common';

@Injectable()
export class TestService {
  constructor(private readonly dep: string) {}
}

console.log('TestService metadata:', Reflect.getMetadata('design:paramtypes', TestService));
