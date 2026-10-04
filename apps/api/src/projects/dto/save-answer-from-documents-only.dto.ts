import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SaveAnswerFromDocumentsOnlyDto {
  @ApiProperty()
  @IsBoolean()
  answerFromDocumentsOnly!: boolean;
}
