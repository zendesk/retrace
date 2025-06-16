import { type ChangeEvent } from 'react'
import * as React from 'react'

interface FileUploadButtonProps {
  name: string
  id: string
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
}

const FileUploadButton = ({ name, id, onChange }: FileUploadButtonProps) => (
  <>
    <div className="file-loader">
      <label htmlFor={id} className="file-input">
        Upload File
        <input
          className="file-input"
          type="file"
          name={name}
          id={id}
          onChange={onChange}
        />
      </label>
    </div>
    <style>{`
    .file-loader {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
    }
    .file-input {
        font-family: sans-serif;
        font-size: 1.5rem;
        background: lightblue;
        padding: 1rem;
        border-radius: .5rem;
        transition: background .2s ease-out;
    }
    .file-input:hover {
        cursor: pointer;
        background: lightgreen;
    }
    .file-input input {
        display: none;
    }
  `}</style>
  </>
)

// eslint-disable-next-line import/no-default-export
export default FileUploadButton
