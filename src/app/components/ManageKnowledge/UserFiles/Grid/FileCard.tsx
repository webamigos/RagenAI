import prettyBytes from 'pretty-bytes';

import { truncateFileName } from '@/app/lib/utils/truncateFileName';

type Document = {
  file_name: string;
  file_size: number;
};

export const FileCard = ({ document }: { document: Document }) => {
  const { file_name, file_size } = document;

  return (
    <div className="p-4 border w-10/12 bg-slate-100 rounded-lg shadow">
      <div>
        <h3>{truncateFileName(file_name, 25)}</h3>
      </div>
      <div className="bg-slate-200 rounded-lg">
        <p>{prettyBytes(file_size)}</p>
      </div>
    </div>
  );
};
