from PIL import Image
from imagehash import phash
from io import BytesIO

def compute_hash(buffer) -> str:
    io = BytesIO(bytes(buffer.to_py()))
    io.name = 'image.jpg'
    im = Image.open(io)
    return str(phash(im))
