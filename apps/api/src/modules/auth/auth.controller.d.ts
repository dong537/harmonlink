import { FastifyRequest } from 'fastify';
import { LoginUseCase } from './use-cases/login.use-case';
import { LogoutUseCase } from './use-cases/logout.use-case';
import { ChangePasswordUseCase } from './use-cases/change-password.use-case';
import { RegisterUserUseCase } from './use-cases/register-user.use-case';
import { CurrentUserDto, LoginResponseDto, RegisterResponseDto } from './dto';
import { AuthenticatedContext } from '../../common/auth/auth-context';
export declare class AuthController {
    private readonly loginUseCase;
    private readonly logoutUseCase;
    private readonly changePasswordUseCase;
    private readonly registerUserUseCase;
    constructor(loginUseCase: LoginUseCase, logoutUseCase: LogoutUseCase, changePasswordUseCase: ChangePasswordUseCase, registerUserUseCase: RegisterUserUseCase);
    login(body: unknown): Promise<LoginResponseDto>;
    register(body: unknown): Promise<RegisterResponseDto>;
    me(ctx: AuthenticatedContext): CurrentUserDto;
    logout(ctx: AuthenticatedContext, req: FastifyRequest): Promise<void>;
    changePassword(ctx: AuthenticatedContext, req: FastifyRequest, body: unknown): Promise<void>;
}
